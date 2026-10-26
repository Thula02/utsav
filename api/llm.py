import os
import time

import httpx
from pydantic import ValidationError


def demo_mode() -> bool:
    return os.environ.get("DEMO_MODE", "0") == "1"


def call_llm(system: str, user: str, json_mode: bool = True) -> str:
    base = os.environ.get("LLM_BASE_URL", "").rstrip("/")
    key = os.environ.get("LLM_API_KEY", "")
    model = os.environ.get("LLM_MODEL", "")
    if not (base and key and model):
        raise RuntimeError("LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set")
    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    r = httpx.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json=payload,
        timeout=120,
    )
    if r.status_code >= 400:
        print(f"LLM HTTP {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"] or ""


def extract_json(text: str) -> str:
    """Strip markdown fences / chatter and return the outermost {...}."""
    text = (text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start != -1 and end > start else text


def generate_json(system: str, user: str, model_cls, retries: int = 2):
    """Ask the LLM for JSON, validate it with Pydantic, retry, else raise. Failure reasons are printed."""
    last_err = None
    json_mode = True
    for attempt in range(retries + 1):
        raw = ""
        try:
            raw = call_llm(system, user, json_mode)
            return model_cls.model_validate_json(extract_json(raw))
        except httpx.HTTPStatusError as e:
            last_err = e
            code = e.response.status_code
            if code == 429:
                time.sleep(5)  # free-tier rate limit: wait, then retry
            elif code == 400 and json_mode:
                json_mode = False  # some models reject response_format: retry without it
        except (httpx.HTTPError, KeyError, IndexError) as e:
            last_err = e
            print(f"LLM attempt {attempt + 1} failed:", repr(e)[:300])
        except (ValidationError, ValueError) as e:
            last_err = e
            print(f"LLM attempt {attempt + 1}: reply did not match the schema:", str(e)[:800])
            print("Raw reply started with:", raw[:400])
            user += "\n\nYour previous output was not valid for the schema. Return ONLY the JSON object."
    raise RuntimeError(f"LLM failed: {last_err}")
