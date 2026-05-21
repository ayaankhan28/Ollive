from abc import ABC, abstractmethod
from typing import AsyncIterator, List, Dict, Any


class BaseLLMProvider(ABC):
    @abstractmethod
    async def stream_chat(
        self, messages: List[Dict[str, Any]], system: str = ""
    ) -> AsyncIterator[str]:
        pass

    @abstractmethod
    async def generate_title(self, first_message: str) -> str:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass
