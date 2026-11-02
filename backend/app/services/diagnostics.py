from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "diagnostics_catalog.json"


@lru_cache(maxsize=1)
def load_catalog() -> List[Dict]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f).get("items", [])


def get_catalog_items(category: Optional[str] = None, query: Optional[str] = None) -> List[Dict]:
    items = load_catalog()
    if category:
        items = [i for i in items if i["category"] == category]
    if query:
        q = query.strip().lower()
        items = [
            i for i in items
            if q in i["name"].lower()
            or q in i["code"].lower()
            or q in i["clinical_code"].lower()
            or any(q in a.lower() for a in i.get("aliases", []))
            or any(q in an["name"].lower() for an in i.get("analytes", []))
        ]
    return items


def get_catalog_item(test_code: str) -> Optional[Dict]:
    code = test_code.strip().lower()
    for item in load_catalog():
        if item["code"].lower() == code:
            return item
    return None


def format_range(low: Optional[float], high: Optional[float]) -> str:
    if low is not None and high is not None:
        return f"{low:g}–{high:g}"
    if high is not None:
        return f"≤ {high:g}"
    if low is not None:
        return f"≥ {low:g}"
    return "—"


def classify_value(val: float, analyte: Dict) -> str:
    c_low = analyte.get("critical_low")
    c_high = analyte.get("critical_high")
    low = analyte.get("low")
    high = analyte.get("high")

    if c_low is not None and val <= c_low:
        return "critical_low"
    if c_high is not None and val >= c_high:
        return "critical_high"
    if low is not None and val < low:
        return "low"
    if high is not None and val > high:
        return "high"
    return "normal"


def evaluate_lab_results(test_code: str, values: List[Dict]) -> Dict:
    item = get_catalog_item(test_code)
    analyte_map = {a["code"].lower(): a for a in (item.get("analytes", []) if item else [])}

    evaluated = []
    has_abnormal = False
    has_critical = False

    for entry in values:
        code = entry["code"].strip().lower()
        spec = analyte_map.get(code, {})
        val = float(entry["value"])
        flag = classify_value(val, spec)

        if flag in ("critical_low", "critical_high"):
            has_critical = True
            has_abnormal = True
        elif flag in ("low", "high"):
            has_abnormal = True

        evaluated.append({
            "code": spec.get("code", entry["code"]),
            "name": spec.get("name") or entry.get("name") or entry["code"],
            "value": val,
            "unit": spec.get("unit") or entry.get("unit") or "",
            "reference_range": format_range(spec.get("low"), spec.get("high")),
            "flag": flag,
        })

    overall = "critical" if has_critical else ("abnormal" if has_abnormal else "normal")
    return {
        "test_code": test_code,
        "overall_flag": overall,
        "has_abnormal": has_abnormal,
        "has_critical": has_critical,
        "analytes": evaluated,
    }

