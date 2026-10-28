"""Service for fetching official FDA drug labels, boxed warnings, and warnings from openFDA."""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"

_CACHE_MAX_ENTRIES = 128
# Only answers openFDA actually gave are kept: a label, or a definite "no such drug" (None).
# A timeout or error is never stored, so one bad moment cannot hide a drug until restart.
_cache: "OrderedDict[str, Optional[Dict[str, Any]]]" = OrderedDict()
_cache_lock = threading.Lock()


class OpenFDAError(Exception):
    """openFDA could not answer (network failure, timeout, or an error status)."""


def _clean_text_list(items: Optional[List[str]]) -> Optional[str]:
    if not items:
        return None
    joined = "\n\n".join(str(item).strip() for item in items if str(item).strip())
    return joined if joined else None


def _quote_phrase(value: str) -> str:
    """Escape a drug name so it stays one quoted phrase in an openFDA (Lucene) search."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _search(client: httpx.Client, search: str) -> Optional[Dict[str, Any]]:
    """Run one openFDA search. Returns the first label, or None when openFDA has no match.

    Raises OpenFDAError for anything that is not a definite answer.
    """
    resp = client.get(
        OPENFDA_LABEL_URL,
        params={"search": search, "limit": 1},
        headers={"User-Agent": "UTEP-EMR/1.0"},
    )
    if resp.status_code == 404:
        return None  # openFDA's way of saying "no matches"
    if resp.status_code != 200:
        raise OpenFDAError(f"openFDA returned status {resp.status_code}")
    results = resp.json().get("results", [])
    return results[0] if results else None


def _lookup(cleaned: str) -> Optional[Dict[str, Any]]:
    phrase = _quote_phrase(cleaned)
    # Search both generic name and brand name (openFDA Lucene syntax)
    query = f"openfda.generic_name:{phrase}+openfda.brand_name:{phrase}"
    with httpx.Client(timeout=4.0) as client:
        item = _search(client, query)
        if item is None:
            # Fall back to the substance name
            item = _search(client, f"openfda.substance_name:{phrase}")
    if item is None:
        return None

    openfda_meta = item.get("openfda", {})
    return {
        "queried_drug": cleaned,
        "generic_names": openfda_meta.get("generic_name", []),
        "brand_names": openfda_meta.get("brand_name", []),
        "substance_names": openfda_meta.get("substance_name", []),
        "pharm_class_cs": openfda_meta.get("pharm_class_cs", []),
        "boxed_warning": _clean_text_list(item.get("boxed_warning")),
        "warnings": _clean_text_list(item.get("warnings_and_precautions") or item.get("warnings")),
        "drug_interactions_text": _clean_text_list(item.get("drug_interactions")),
        "indications_and_usage": _clean_text_list(item.get("indications_and_usage")),
    }


def fetch_fda_label(drug_name: str) -> Optional[Dict[str, Any]]:
    """Query openFDA for drug labeling, boxed warnings, and official interactions text.

    Returns None if the drug is not found or openFDA could not be reached.
    Successful answers (including "not found") are cached in memory; failures are not.
    """
    cleaned = drug_name.strip()
    if len(cleaned) < 2:
        return None

    with _cache_lock:
        if cleaned in _cache:
            _cache.move_to_end(cleaned)
            return _cache[cleaned]

    try:
        result = _lookup(cleaned)
    except Exception as exc:  # network failure, timeout, bad status, or bad JSON
        logger.warning("Failed to fetch openFDA label for %s: %s", cleaned, exc)
        return None

    with _cache_lock:
        _cache[cleaned] = result
        _cache.move_to_end(cleaned)
        while len(_cache) > _CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)
    return result


def clear_cache() -> None:
    """Forget every cached answer (used by tests)."""
    with _cache_lock:
        _cache.clear()
