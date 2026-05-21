import logging
from typing import AsyncIterator, List, Dict

from app.core.llm.anthropic_provider import AnthropicProvider
from app.core.llm.gemini_provider import GeminiProvider

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Ollive, a helpful, friendly, and knowledgeable AI assistant.
You provide clear, accurate, and thoughtful responses.
You can help with a wide range of tasks including coding, writing, analysis, and general questions.
Be concise but thorough. Use markdown formatting when appropriate."""


class LLMManager:
    def __init__(self):
        self._anthropic = AnthropicProvider()
        self._gemini = GeminiProvider()

    async def stream_chat(
        self, messages: List[Dict], system: str = ""
    ) -> AsyncIterator[str]:
        """Try Anthropic first, fall back to Gemini on error."""
        if not system:
            system = SYSTEM_PROMPT

        # Try Anthropic first
        try:
            logger.info("Attempting to stream chat via Anthropic")
            async for chunk in self._anthropic.stream_chat(messages, system):
                yield chunk
            logger.info("Anthropic stream completed successfully")
            return
        except Exception as e:
            logger.warning(f"Anthropic failed, falling back to Gemini: {e}")

        # Fallback to Gemini
        try:
            logger.info("Attempting to stream chat via Gemini (fallback)")
            async for chunk in self._gemini.stream_chat(messages, system):
                yield chunk
            logger.info("Gemini stream completed successfully")
        except Exception as e:
            logger.error(f"Both LLM providers failed. Gemini error: {e}")
            raise RuntimeError(
                f"All LLM providers failed. Last error: {e}"
            )

    async def generate_title(self, first_message: str) -> str:
        """Generate a session title, trying Anthropic first then Gemini."""
        try:
            return await self._anthropic.generate_title(first_message)
        except Exception as e:
            logger.warning(f"Anthropic title generation failed: {e}, trying Gemini")
            try:
                return await self._gemini.generate_title(first_message)
            except Exception as e2:
                logger.error(f"Both providers failed for title generation: {e2}")
                words = first_message.split()[:4]
                return " ".join(words) if words else "New Chat"


# Singleton instance
llm_manager = LLMManager()
