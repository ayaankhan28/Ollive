import logging
from typing import AsyncIterator, List, Dict

import anthropic

from app.core.llm.base import BaseLLMProvider
from app.core.config import settings

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseLLMProvider):
    def __init__(self):
        self._client = None

    def _get_client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(
                api_key=settings.ANTHROPIC_API_KEY
            )
        return self._client

    @property
    def name(self) -> str:
        return "anthropic"

    async def stream_chat(
        self, messages: List[Dict], system: str = ""
    ) -> AsyncIterator[str]:
        client = self._get_client()
        try:
            kwargs = {
                "model": "claude-sonnet-4-6",
                "max_tokens": 8096,
                "messages": messages,
            }
            if system:
                kwargs["system"] = system

            async with client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text
        except anthropic.APIConnectionError as e:
            logger.error(f"Anthropic connection error: {e}")
            raise
        except anthropic.RateLimitError as e:
            logger.error(f"Anthropic rate limit error: {e}")
            raise
        except anthropic.APIStatusError as e:
            logger.error(f"Anthropic API status error: {e.status_code} - {e.message}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error from Anthropic: {e}")
            raise

    async def generate_title(self, first_message: str) -> str:
        client = self._get_client()
        try:
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=32,
                system=(
                    "Generate a very short title (3-5 words) for a chat conversation "
                    "that starts with the given message. Return ONLY the title, no quotes, "
                    "no punctuation at the end, no explanation."
                ),
                messages=[{"role": "user", "content": first_message}],
            )
            title = response.content[0].text.strip().strip('"').strip("'")
            # Truncate to reasonable length
            if len(title) > 60:
                title = title[:57] + "..."
            return title
        except Exception as e:
            logger.error(f"Error generating title with Anthropic: {e}")
            # Return a fallback title based on the first few words
            words = first_message.split()[:4]
            return " ".join(words) if words else "New Chat"
