"""Context variable propagation for trace metadata."""

from contextvars import ContextVar
from contextlib import contextmanager
from typing import Optional

_session_id: ContextVar[Optional[str]] = ContextVar("obs_session_id", default=None)
_user_id: ContextVar[Optional[str]] = ContextVar("obs_user_id", default=None)
_conversation_id: ContextVar[Optional[str]] = ContextVar("obs_conversation_id", default=None)


def set_session_id(value: Optional[str]) -> None:
    _session_id.set(value)


def set_user_id(value: Optional[str]) -> None:
    _user_id.set(value)


def set_conversation_id(value: Optional[str]) -> None:
    _conversation_id.set(value)


def get_context() -> dict:
    return {
        "session_id": _session_id.get(),
        "user_id": _user_id.get(),
        "conversation_id": _conversation_id.get(),
    }


@contextmanager
def trace_context(
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
):
    """Context manager to bind trace metadata for the duration of a block."""
    resets = []
    if session_id is not None:
        resets.append((_session_id, _session_id.set(session_id)))
    if user_id is not None:
        resets.append((_user_id, _user_id.set(user_id)))
    if conversation_id is not None:
        resets.append((_conversation_id, _conversation_id.set(conversation_id)))
    try:
        yield
    finally:
        for var, tok in reversed(resets):
            var.reset(tok)
