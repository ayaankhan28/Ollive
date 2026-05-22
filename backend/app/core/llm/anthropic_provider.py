import logging
from typing import AsyncIterator, List, Dict

import anthropic

from app.core.llm.base import BaseLLMProvider
from app.core.config import settings

logger = logging.getLogger(__name__)

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 8096


class AnthropicProvider(BaseLLMProvider):
    def __init__(self):
        self._client = None

    def _get_client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._client

    @property
    def name(self) -> str:
        return "anthropic"

    async def stream_chat(
        self, messages: List[Dict], system: str = ""
    ) -> AsyncIterator[str]:
        try:
            import observe_me
            obs = observe_me.get_client()
        except ImportError:
            obs = None

        client = self._get_client()

        input_preview = messages[-1].get("content", "")[:500] if messages else ""
        trace = obs.start_trace(
            provider="anthropic",
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            input_preview=input_preview,
        ) if obs else None

        try:
            kwargs: Dict = {
                "model": _MODEL,
                "max_tokens": _MAX_TOKENS,
                "messages": messages,
            }
            if system:
                kwargs["system"] = system

            async with client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    if trace:
                        trace.on_chunk(text)
                    yield text

                # Capture usage after stream exhaustion (still inside context manager)
                if trace:
                    try:
                        final = await stream.get_final_message()
                        trace.complete(
                            prompt_tokens=final.usage.input_tokens,
                            completion_tokens=final.usage.output_tokens,
                        )
                    except Exception:
                        trace.complete()

        except anthropic.APIConnectionError as e:
            logger.error("Anthropic connection error: %s", e)
            if trace:
                trace.fail(e)
            raise
        except anthropic.RateLimitError as e:
            logger.error("Anthropic rate limit error: %s", e)
            if trace:
                trace.fail(e)
            raise
        except anthropic.APIStatusError as e:
            logger.error("Anthropic API status error: %s - %s", e.status_code, e.message)
            if trace:
                trace.fail(e)
            raise
        except Exception as e:
            logger.error("Unexpected error from Anthropic: %s", e)
            if trace:
                trace.fail(e)
            raise
        finally:
            if trace:
                trace.emit_nowait()

    async def generate_title(self, first_message: str) -> str:
        client = self._get_client()
        try:
            response = await client.messages.create(
                model=_MODEL,
                max_tokens=32,
                system=(
                    "Generate a very short title (3-5 words) for a chat conversation "
                    "that starts with the given message. Return ONLY the title, no quotes, "
                    "no punctuation at the end, no explanation."
                ),
                messages=[{"role": "user", "content": first_message}],
            )
            title = response.content[0].text.strip().strip('"').strip("'")
            if len(title) > 60:
                title = title[:57] + "..."
            return title
        except Exception as e:
            logger.error("Error generating title with Anthropic: %s", e)
            words = first_message.split()[:4]
            return " ".join(words) if words else "New Chat"
