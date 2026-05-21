import asyncio
import logging
from typing import AsyncIterator, List, Dict

from google import genai
from google.genai import types

from app.core.llm.base import BaseLLMProvider
from app.core.config import settings

logger = logging.getLogger(__name__)


def _convert_messages_to_gemini(
    messages: List[Dict], system: str = ""
) -> tuple[List[types.Content], str]:
    """Convert OpenAI-format messages to Gemini format."""
    contents = []

    for msg in messages:
        role = msg["role"]
        content = msg["content"]

        # Gemini uses "user" and "model" roles
        gemini_role = "model" if role == "assistant" else "user"

        contents.append(
            types.Content(
                role=gemini_role,
                parts=[types.Part(text=content)],
            )
        )

    return contents, system


class GeminiProvider(BaseLLMProvider):
    def __init__(self):
        self._client = None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return self._client

    @property
    def name(self) -> str:
        return "gemini"

    async def stream_chat(
        self, messages: List[Dict], system: str = ""
    ) -> AsyncIterator[str]:
        client = self._get_client()
        contents, system_instruction = _convert_messages_to_gemini(messages, system)

        config_kwargs: Dict = {
            "max_output_tokens": 8096,
        }
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction

        config = types.GenerateContentConfig(**config_kwargs)

        try:
            # google-genai SDK uses sync iteration; run in executor to avoid blocking
            loop = asyncio.get_event_loop()

            def _sync_stream():
                chunks = []
                response = client.models.generate_content_stream(
                    model="gemini-2.0-flash",
                    contents=contents,
                    config=config,
                )
                for chunk in response:
                    if chunk.text:
                        chunks.append(chunk.text)
                return chunks

            chunks = await loop.run_in_executor(None, _sync_stream)
            for chunk_text in chunks:
                yield chunk_text

        except Exception as e:
            logger.error(f"Gemini streaming error: {e}")
            raise

    async def generate_title(self, first_message: str) -> str:
        client = self._get_client()
        try:
            loop = asyncio.get_event_loop()

            def _sync_generate():
                config = types.GenerateContentConfig(
                    max_output_tokens=32,
                    system_instruction=(
                        "Generate a very short title (3-5 words) for a chat conversation "
                        "that starts with the given message. Return ONLY the title, no quotes, "
                        "no punctuation at the end, no explanation."
                    ),
                )
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=first_message,
                    config=config,
                )
                return response.text

            title = await loop.run_in_executor(None, _sync_generate)
            title = title.strip().strip('"').strip("'")
            if len(title) > 60:
                title = title[:57] + "..."
            return title
        except Exception as e:
            logger.error(f"Error generating title with Gemini: {e}")
            words = first_message.split()[:4]
            return " ".join(words) if words else "New Chat"
