import asyncio
import logging
from typing import AsyncIterator, List, Dict, Any

from google import genai
from google.genai import types

from app.core.llm.base import BaseLLMProvider
from app.core.config import settings

logger = logging.getLogger(__name__)


def _to_gemini_contents(messages: List[Dict]) -> List[types.Content]:
    """Convert OpenAI-format messages to Gemini Content objects."""
    return [
        types.Content(
            role="model" if msg["role"] == "assistant" else "user",
            parts=[types.Part(text=msg["content"])],
        )
        for msg in messages
    ]


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider — pure LLM logic, no tracing concerns."""

    def __init__(self):
        self._client: genai.Client | None = None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return self._client

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def model(self) -> str:
        return settings.GEMINI_MODEL

    @property
    def max_tokens(self) -> int:
        return settings.GEMINI_MAX_TOKENS

    async def _do_stream(
        self, messages: List[Dict[str, Any]], system: str = ""
    ) -> AsyncIterator[str]:
        """Stream chat from Gemini. Sets self._last_usage if usage is available."""
        client = self._get_client()
        contents = _to_gemini_contents(messages)

        config_kwargs: Dict[str, Any] = {"max_output_tokens": settings.GEMINI_MAX_TOKENS}
        if system:
            config_kwargs["system_instruction"] = system
        config = types.GenerateContentConfig(**config_kwargs)

        try:
            loop = asyncio.get_event_loop()

            def _sync_stream() -> tuple[list[str], Any]:
                chunks: list[str] = []
                usage_meta = None
                for chunk in client.models.generate_content_stream(
                    model=settings.GEMINI_MODEL, contents=contents, config=config
                ):
                    if chunk.text:
                        chunks.append(chunk.text)
                    if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                        usage_meta = chunk.usage_metadata
                return chunks, usage_meta

            chunks, usage_meta = await loop.run_in_executor(None, _sync_stream)

            for text in chunks:
                yield text

            if usage_meta and hasattr(usage_meta, "prompt_token_count"):
                self._last_usage = (
                    getattr(usage_meta, "prompt_token_count", 0) or 0,
                    getattr(usage_meta, "candidates_token_count", 0) or 0,
                )

        except Exception as e:
            logger.error("Gemini streaming error: %s", e)
            raise

    async def generate_title(self, first_message: str) -> str:
        client = self._get_client()
        try:
            loop = asyncio.get_event_loop()

            def _sync_generate() -> str:
                config = types.GenerateContentConfig(
                    max_output_tokens=32,
                    system_instruction=(
                        "Generate a very short title (3-5 words) for a chat conversation "
                        "that starts with the given message. Return ONLY the title, no quotes, "
                        "no punctuation at the end, no explanation."
                    ),
                )
                response = client.models.generate_content(
                    model=settings.GEMINI_MODEL, contents=first_message, config=config
                )
                return response.text

            title = await loop.run_in_executor(None, _sync_generate)
            title = title.strip().strip('"').strip("'")
            return title[:57] + "..." if len(title) > 60 else title
        except Exception as e:
            logger.error("Gemini title generation failed: %s", e)
            words = first_message.split()[:4]
            return " ".join(words) if words else "New Chat"
