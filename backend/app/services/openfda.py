"""Service for fetching official FDA drug labels, boxed warnings, and warnings from openFDA."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"


def _clean_text_list(items: Optional[List[str]]) -> Optional[str]:
    if not items:
        return None
    joined = "\n\n".join(str(item).strip() for item in items if str(item).strip())
    return joined if joined else None


@lru_cache(maxsize=128)
def fetch_fda_label(drug_name: str) -> Optional[Dict[str, Any]]:
    """Query openFDA for drug labeling, boxed warnings, and official interactions text.

    Returns None if openFDA is unreachable, times out, or drug is not found.
    Results are cached in memory.
    """
    cleaned = drug_name.strip()
    if not cleaned or len(cleaned) < 2:
        return None

    # Search both generic name and brand name
    # openFDA Lucene syntax
    query = f'openfda.generic_name:"{cleaned}"+openfda.brand_name:"{cleaned}"'
    params = {"search": query, "limit": 1}

    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(
                OPENFDA_LABEL_URL,
                params=params,
                headers={"User-Agent": "UTEP-EMR/1.0"},
            )
            if resp.status_code == 404:
                # Try fallback searching substance_name
                fallback_params = {"search": f'openfda.substance_name:"{cleaned}"', "limit": 1}
                resp = client.get(
                    OPENFDA_LABEL_URL,
                    params=fallback_params,
                    headers={"User-Agent": "UTEP-EMR/1.0"},
                )
                if resp.status_code != 200:
                    return None
            elif resp.status_code != 200:
                logger.warning("openFDA returned status %s for query %s", resp.status_code, cleaned)
                return None

            data = resp.json()
            results = data.get("results", [])
            if not results:
                return None

            item = results[0]
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
    except Exception as exc:
        logger.warning("Failed to fetch openFDA label for %s: %s", cleaned, exc)
        return None
