"""PII redactor — strips emails, phone numbers, and common API key patterns from text."""

from __future__ import annotations

import re

_RULES: list[tuple[re.Pattern, str]] = [
    # Email addresses
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'), '[email]'),
    # Phone numbers (US/international)
    (re.compile(r'\b(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b'), '[phone]'),
    # OpenAI keys (sk-...)
    (re.compile(r'\bsk-[A-Za-z0-9]{20,}\b'), '[api-key]'),
    # Anthropic keys (sk-ant-...)
    (re.compile(r'\bsk-ant-[A-Za-z0-9\-_]{20,}\b'), '[api-key]'),
    # Google API keys (AIza...)
    (re.compile(r'\bAIza[0-9A-Za-z\-_]{35}\b'), '[api-key]'),
    # GitHub personal access tokens
    (re.compile(r'\bghp_[A-Za-z0-9]{36}\b'), '[api-key]'),
    # Bearer tokens
    (re.compile(r'\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b', re.IGNORECASE), 'Bearer [token]'),
    # Generic secrets: key=value or key: value patterns
    (re.compile(
        r'(?i)(api[_\-]?key|secret|password|token|auth)\s*[:=]\s*["\']?[A-Za-z0-9\-_/+=]{8,}["\']?'
    ), r'\1=[redacted]'),
]


def redact(text: str) -> str:
    """Return text with PII and secrets replaced by placeholder tokens."""
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    return text
