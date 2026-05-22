"""Provider pricing tables (USD per 1M tokens)."""

PRICING: dict[str, dict[str, dict[str, float]]] = {
    "anthropic": {
        "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
        "claude-opus-4-7": {"input": 15.0, "output": 75.0},
        "claude-haiku-4-5": {"input": 0.25, "output": 1.25},
        "claude-3-5-sonnet-20241022": {"input": 3.0, "output": 15.0},
        "claude-3-5-haiku-20241022": {"input": 0.8, "output": 4.0},
        "claude-3-opus-20240229": {"input": 15.0, "output": 75.0},
    },
    "openai": {
        "gpt-4o": {"input": 5.0, "output": 15.0},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4-turbo": {"input": 10.0, "output": 30.0},
        "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
    },
    "gemini": {
        "gemini-1.5-pro": {"input": 1.25, "output": 5.0},
        "gemini-1.5-flash": {"input": 0.075, "output": 0.3},
        "gemini-2.0-flash": {"input": 0.1, "output": 0.4},
    },
}


def estimate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    provider_pricing = PRICING.get(provider, {})
    # Try exact match first, then prefix match
    model_pricing = provider_pricing.get(model)
    if model_pricing is None:
        for key in provider_pricing:
            if model.startswith(key) or key.startswith(model):
                model_pricing = provider_pricing[key]
                break
    if model_pricing is None:
        return None
    cost = (prompt_tokens * model_pricing["input"] + completion_tokens * model_pricing["output"]) / 1_000_000
    return round(cost, 8)
