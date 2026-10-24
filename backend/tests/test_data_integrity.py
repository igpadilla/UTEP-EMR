"""Tests for data integrity of formulary, interactions, and allergy knowledge base."""

import json
from pathlib import Path
import pytest
from app.services.medication_safety import KnowledgeBase, get_knowledge_base, SEVERITY_ORDER

DATA_DIR = Path(__file__).resolve().parent.parent / "app" / "data"
FRONTEND_MEDICINES = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "medicines.json"
)


def test_formulary_loads_and_has_100_plus_drugs():
    with open(DATA_DIR / "formulary.json", encoding="utf-8") as f:
        data = json.load(f)
    drugs = data["drugs"]
    assert len(drugs) >= 100
    ids = [d["id"] for d in drugs]
    assert len(ids) == len(set(ids)), "All drug IDs must be unique"
    for drug in drugs:
        assert drug["id"] >= 1
        assert drug["name"]
        assert drug["min"] >= 0
        assert drug["max"] >= drug["min"]
        assert drug["unit"]
        assert isinstance(drug.get("classes", []), list)


def test_formulary_ids_1_to_20_match_frontend_medicines():
    if not FRONTEND_MEDICINES.exists():
        pytest.skip("frontend/src/data/medicines.json not found in workspace")

    with open(FRONTEND_MEDICINES, encoding="utf-8") as f:
        fe_medicines = json.load(f)
    with open(DATA_DIR / "formulary.json", encoding="utf-8") as f:
        backend_data = json.load(f)

    be_by_id = {d["id"]: d for d in backend_data["drugs"]}

    for fe_med in fe_medicines:
        fe_id = fe_med["id"]
        assert fe_id in be_by_id, f"Drug ID {fe_id} missing from backend formulary"
        be_med = be_by_id[fe_id]
        assert be_med["name"] == fe_med["name"], f"Name mismatch for ID {fe_id}"
        assert be_med["min"] == fe_med["min"], f"Min dose mismatch for ID {fe_id}"
        assert be_med["max"] == fe_med["max"], f"Max dose mismatch for ID {fe_id}"
        assert be_med["unit"] == fe_med["unit"], f"Unit mismatch for ID {fe_id}"


def test_knowledge_base_validation_passes():
    kb = get_knowledge_base()
    kb.validate()
    assert len(kb.drugs) >= 100
    assert len(kb.interactions) > 0
    assert len(kb.duplicate_therapy) > 0
    assert len(kb.allergy_entries) > 0


def test_all_interaction_rules_tokens_exist():
    kb = get_knowledge_base()
    all_known = set(kb.classes) | {d["name"].lower() for d in kb.drugs}

    for rule in kb.interactions:
        assert rule["severity"] in SEVERITY_ORDER
        groups = rule["all_of"] if "all_of" in rule else [rule["a"], rule["b"]]
        for group in groups:
            for token in group:
                assert token.lower() in all_known, f"Token {token} in rule {rule['id']} is not in classes or drugs"


def test_duplicate_therapy_classes_exist():
    kb = get_knowledge_base()
    for dup in kb.duplicate_therapy:
        assert dup["severity"] in SEVERITY_ORDER
        assert dup["class"].lower() in kb.classes, f"Duplicate class {dup['class']} not in formulary classes"


def test_allergy_classes_and_drugs_exist():
    kb = get_knowledge_base()
    all_known_classes = set(kb.classes)
    all_known_drugs = {d["name"].lower() for d in kb.drugs}

    for entry in kb.allergy_entries:
        for reaction in entry["reactions"]:
            assert reaction["severity"] in SEVERITY_ORDER
            for cls in reaction.get("classes", []):
                assert cls.lower() in all_known_classes, f"Allergy class {cls} not in formulary"
            for drug in reaction.get("drugs", []):
                assert drug.lower() in all_known_drugs, f"Allergy drug {drug} not in formulary"
