"""Medication safety engine.

Deterministic, offline rules engine that checks a medication regimen for
drug-drug interactions, drug-allergy conflicts, duplicate therapy and
dosage problems. All clinical content lives in ``app/data/*.json``.

EDUCATIONAL USE ONLY: the data is draft content that must be reviewed by
clinical faculty before it is used for grading.
"""

from __future__ import annotations

import itertools
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SEVERITY_ORDER = {"minor": 1, "moderate": 2, "major": 3, "contraindicated": 4}


class KnowledgeBaseError(ValueError):
    """Raised when the curated JSON data is inconsistent."""


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _to_float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def _fmt(number: float) -> str:
    return f"{number:g}"


@dataclass
class Drug:
    """A formulary drug plus the dose information supplied by the caller."""

    id: int
    name: str
    classes: frozenset
    min: float
    max: float
    unit: str
    max_daily: Optional[float] = None
    acetaminophen_mg_per_unit: Optional[float] = None
    aliases: tuple = ()
    dosage: Optional[float] = None
    frequency: Optional[float] = None
    given_unit: Optional[str] = None
    is_candidate: bool = False

    def matches(self, token: str) -> bool:
        token = _norm(token)
        return token in self.classes or token == _norm(self.name)


@dataclass
class KnowledgeBase:
    """Loads and validates the curated JSON data."""

    drugs: list
    interactions: list
    duplicate_therapy: list
    limits: dict
    allergy_entries: list
    cross_reactive_classes: frozenset
    by_id: dict = field(default_factory=dict)
    by_name: dict = field(default_factory=dict)
    classes: frozenset = frozenset()
    direct_terms: list = field(default_factory=list)

    @classmethod
    def load(cls, data_dir: Path = DATA_DIR) -> "KnowledgeBase":
        with open(data_dir / "formulary.json", encoding="utf-8") as fh:
            formulary = json.load(fh)
        with open(data_dir / "interactions.json", encoding="utf-8") as fh:
            interactions = json.load(fh)
        with open(data_dir / "allergies.json", encoding="utf-8") as fh:
            allergies = json.load(fh)

        kb = cls(
            drugs=formulary["drugs"],
            interactions=interactions["interactions"],
            duplicate_therapy=interactions["duplicate_therapy"],
            limits=interactions.get("limits", {}),
            allergy_entries=allergies["entries"],
            cross_reactive_classes=frozenset(
                _norm(c) for c in allergies.get("direct_match_cross_reactive_classes", [])
            ),
        )
        kb._index()
        kb.validate()
        return kb

    # ------------------------------------------------------------------ index
    def _index(self) -> None:
        all_classes = set()
        for raw in self.drugs:
            all_classes.update(_norm(c) for c in raw.get("classes", []))
            self.by_id[raw["id"]] = raw
            self.by_name[_norm(raw["name"])] = raw
            for alias in raw.get("aliases", []):
                self.by_name.setdefault(_norm(alias), raw)
        self.classes = frozenset(all_classes)

        # Terms used to detect a drug named directly inside an allergy string.
        terms: dict = {}

        def add(term: str, raw: dict) -> None:
            term = _norm(term)
            if len(term) >= 4:
                terms.setdefault(term, raw)

        for raw in self.drugs:
            add(raw["name"], raw)
            for part in re.split(r"[/,]", raw["name"]):
                add(part, raw)
            for alias in raw.get("aliases", []):
                add(alias, raw)
        # Longest terms first so "hydrocodone" is not shadowed by a shorter term.
        self.direct_terms = sorted(terms.items(), key=lambda item: -len(item[0]))

    # --------------------------------------------------------------- validate
    def validate(self) -> None:
        problems = []
        ids = [d["id"] for d in self.drugs]
        if len(ids) != len(set(ids)):
            problems.append("duplicate drug ids in formulary")
        names = [_norm(d["name"]) for d in self.drugs]
        if len(names) != len(set(names)):
            problems.append("duplicate drug names in formulary")

        drug_names = set(names)

        def check_token(token: str, where: str) -> None:
            t = _norm(token)
            if t not in self.classes and t not in drug_names:
                problems.append(f"{where}: unknown class or drug '{token}'")

        for rule in self.interactions:
            rid = rule.get("id", "?")
            if rule.get("severity") not in SEVERITY_ORDER:
                problems.append(f"{rid}: invalid severity")
            groups = rule["all_of"] if "all_of" in rule else [rule.get("a", []), rule.get("b", [])]
            for group in groups:
                if not group:
                    problems.append(f"{rid}: empty group")
                for token in group:
                    check_token(token, rid)
        for dup in self.duplicate_therapy:
            check_token(dup["class"], "duplicate_therapy")
        for entry in self.allergy_entries:
            for reaction in entry["reactions"]:
                for token in reaction.get("classes", []):
                    check_token(token, f"allergy {entry['key']}")
                for token in reaction.get("drugs", []):
                    check_token(token, f"allergy {entry['key']}")
        for token in self.cross_reactive_classes:
            check_token(token, "direct_match_cross_reactive_classes")
        if problems:
            raise KnowledgeBaseError("; ".join(problems))

    # ------------------------------------------------------------- resolution
    def resolve(self, name: Optional[str] = None, drug_id: Optional[int] = None) -> Optional[dict]:
        if drug_id is not None and drug_id in self.by_id:
            return self.by_id[drug_id]
        if name:
            return self.by_name.get(_norm(name))
        return None


@lru_cache(maxsize=1)
def get_knowledge_base() -> KnowledgeBase:
    return KnowledgeBase.load()


def _build_drug(raw: dict, entry: dict, is_candidate: bool) -> Drug:
    return Drug(
        id=raw["id"],
        name=raw["name"],
        classes=frozenset(_norm(c) for c in raw.get("classes", [])),
        min=raw["min"],
        max=raw["max"],
        unit=raw["unit"],
        max_daily=raw.get("max_daily"),
        acetaminophen_mg_per_unit=raw.get("acetaminophen_mg_per_unit"),
        aliases=tuple(raw.get("aliases", [])),
        dosage=_to_float(entry.get("dosage")),
        frequency=_to_float(entry.get("frequency")),
        given_unit=entry.get("unit"),
        is_candidate=is_candidate,
    )


def _alert(
    type_: str,
    severity: str,
    drugs: Iterable[str],
    title: str,
    description: str,
    recommendation: str,
    involves_candidate: bool,
    rule_id: Optional[str] = None,
) -> dict:
    return {
        "id": "",
        "type": type_,
        "severity": severity,
        "drugs": list(drugs),
        "title": title,
        "description": description,
        "recommendation": recommendation,
        "involves_candidate": involves_candidate,
        "rule_id": rule_id,
    }


def _rule_is_specific(rule: dict) -> bool:
    """True when a rule names exact drugs instead of only classes."""
    groups = rule["all_of"] if "all_of" in rule else [rule["a"], rule["b"]]
    kb = get_knowledge_base()
    drug_names = set(kb.by_name)
    return any(_norm(t) in drug_names and _norm(t) not in kb.classes for g in groups for t in g)


class MedicationSafetyEngine:
    """Runs all safety checks against a regimen."""

    def __init__(self, kb: Optional[KnowledgeBase] = None):
        self.kb = kb or get_knowledge_base()

    # ----------------------------------------------------------------- public
    def check(
        self,
        medications: Optional[list] = None,
        candidate: Optional[dict] = None,
        allergies: Optional[list] = None,
    ) -> dict:
        medications = medications or []
        allergies = [a for a in (allergies or []) if _norm(a)]

        unrecognized: list = []
        drugs: list = []
        seen_ids: set = set()
        duplicate_alerts: list = []

        entries = [(m, False) for m in medications]
        if candidate:
            entries.append((candidate, True))

        # A candidate that is already on the regimen is a duplicate, not a new drug.
        regimen_ids = set()
        for entry, _ in entries[: len(medications)]:
            raw = self.kb.resolve(entry.get("name"), entry.get("id"))
            if raw:
                regimen_ids.add(raw["id"])

        for entry, is_candidate in entries:
            raw = self.kb.resolve(entry.get("name"), entry.get("id"))
            if raw is None:
                unrecognized.append(entry.get("name") or str(entry.get("id")))
                continue
            drug = _build_drug(raw, entry, is_candidate)
            if raw["id"] in seen_ids:
                duplicate_alerts.append(
                    _alert(
                        "duplicate_therapy",
                        "major",
                        [drug.name],
                        f"Duplicate order: {drug.name}",
                        f"{drug.name} appears more than once in the medication list.",
                        "Remove the duplicate entry or confirm the intended total dose.",
                        is_candidate,
                        "DUP-DRUG",
                    )
                )
                continue
            seen_ids.add(raw["id"])
            drugs.append(drug)

        alerts: list = []
        alerts.extend(duplicate_alerts)
        alerts.extend(self._interaction_alerts(drugs))
        alerts.extend(self._duplicate_class_alerts(drugs))
        alerts.extend(self._allergy_alerts(drugs, allergies))
        alerts.extend(self._dose_alerts(drugs))

        alerts.sort(
            key=lambda a: (
                -SEVERITY_ORDER[a["severity"]],
                0 if a["involves_candidate"] else 1,
                a["type"],
                a["title"],
            )
        )
        for index, alert in enumerate(alerts, start=1):
            alert["id"] = f"alert-{index}"

        highest = max((a["severity"] for a in alerts), key=SEVERITY_ORDER.get, default=None)
        return {
            "alerts": alerts,
            "checked_medications": [d.name for d in drugs],
            "unrecognized_medications": unrecognized,
            "has_alerts": bool(alerts),
            "highest_severity": highest,
        }

    # ----------------------------------------------------------- interactions
    @staticmethod
    def _group_matches(drug: Drug, group: list) -> bool:
        return any(drug.matches(token) for token in group)

    def _interaction_alerts(self, drugs: list) -> list:
        best: dict = {}  # frozenset(drug names) -> (rank, rule, drugs involved)

        def consider(involved: tuple, rule: dict) -> None:
            key = frozenset(d.name for d in involved)
            rank = (SEVERITY_ORDER[rule["severity"]], 1 if _rule_is_specific(rule) else 0)
            current = best.get(key)
            if current is None or rank > current[0]:
                best[key] = (rank, rule, involved)

        for rule in self.kb.interactions:
            if "all_of" in rule:
                groups = rule["all_of"]
                candidates = [[d for d in drugs if self._group_matches(d, g)] for g in groups]
                if not all(candidates):
                    continue
                for combo in itertools.product(*candidates):
                    if len({d.name for d in combo}) == len(groups):
                        consider(combo, rule)
                continue
            for first, second in itertools.combinations(drugs, 2):
                forward = self._group_matches(first, rule["a"]) and self._group_matches(second, rule["b"])
                backward = self._group_matches(second, rule["a"]) and self._group_matches(first, rule["b"])
                if forward or backward:
                    consider((first, second), rule)

        alerts = []
        for _, rule, involved in best.values():
            alerts.append(
                _alert(
                    "drug_interaction",
                    rule["severity"],
                    [d.name for d in involved],
                    rule["title"],
                    rule["description"],
                    rule["recommendation"],
                    any(d.is_candidate for d in involved),
                    rule["id"],
                )
            )
        return alerts

    # -------------------------------------------------------------- duplicates
    def _duplicate_class_alerts(self, drugs: list) -> list:
        alerts = []
        for dup in self.kb.duplicate_therapy:
            members = [d for d in drugs if d.matches(dup["class"])]
            if len(members) < 2:
                continue
            alerts.append(
                _alert(
                    "duplicate_therapy",
                    dup["severity"],
                    [d.name for d in members],
                    f"Duplicate therapy: {dup['label']}",
                    f"More than one {dup['label'].lower()} is on the regimen: "
                    f"{', '.join(d.name for d in members)}.",
                    "Use a single agent from this class unless there is a documented reason for combining them.",
                    any(d.is_candidate for d in members),
                    f"DUP-{dup['class']}",
                )
            )
        return alerts

    # --------------------------------------------------------------- allergies
    @staticmethod
    def _contains_term(text: str, term: str) -> bool:
        return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None

    def _allergy_alerts(self, drugs: list, allergies: list) -> list:
        best: dict = {}  # (allergy, drug name) -> alert

        def record(allergy: str, drug: Drug, severity: str, title: str, note: str, rule_id: str) -> None:
            key = (_norm(allergy), drug.name)
            current = best.get(key)
            if current is not None and SEVERITY_ORDER[current["severity"]] >= SEVERITY_ORDER[severity]:
                return
            best[key] = _alert(
                "allergy",
                severity,
                [drug.name],
                title,
                note,
                "Do not give without prescriber review. Confirm the allergy history and consider an alternative.",
                drug.is_candidate,
                rule_id,
            )

        for allergy in allergies:
            text = _norm(allergy)

            for entry in self.kb.allergy_entries:
                if not any(self._contains_term(text, _norm(s)) for s in entry["synonyms"]):
                    continue
                for reaction in entry["reactions"]:
                    tokens = list(reaction.get("classes", [])) + list(reaction.get("drugs", []))
                    for drug in drugs:
                        if any(drug.matches(t) for t in tokens):
                            record(
                                allergy,
                                drug,
                                reaction["severity"],
                                f"Allergy conflict: {drug.name} ({entry['label']} allergy)",
                                reaction["note"],
                                f"ALG-{entry['key']}",
                            )

            # A drug named directly inside the allergy text.
            direct_ids = set()
            for term, raw in self.kb.direct_terms:
                if self._contains_term(text, term):
                    direct_ids.add(raw["id"])
            for drug in drugs:
                if drug.id in direct_ids:
                    record(
                        allergy,
                        drug,
                        "contraindicated",
                        f"Allergy conflict: {drug.name}",
                        f"The patient has a documented allergy to '{allergy}', which names {drug.name}.",
                        "ALG-DIRECT",
                    )
            direct_drugs = [self.kb.by_id[i] for i in direct_ids]
            direct_classes = set()
            for raw in direct_drugs:
                direct_classes.update(
                    c for c in (_norm(x) for x in raw.get("classes", [])) if c in self.kb.cross_reactive_classes
                )
            for drug in drugs:
                if drug.id in direct_ids:
                    continue
                shared = direct_classes & drug.classes
                if shared:
                    named = ", ".join(sorted(r["name"] for r in direct_drugs))
                    record(
                        allergy,
                        drug,
                        "major",
                        f"Possible cross-reactivity: {drug.name}",
                        f"The patient is allergic to {named}; {drug.name} is in the same drug class.",
                        "ALG-CLASS",
                    )
        return list(best.values())

    # ------------------------------------------------------------------- doses
    def _dose_alerts(self, drugs: list) -> list:
        alerts = []
        acetaminophen_total = 0.0
        acetaminophen_drugs = []

        for drug in drugs:
            per_unit = drug.acetaminophen_mg_per_unit
            if per_unit and drug.dosage is not None and drug.frequency is not None:
                acetaminophen_total += drug.dosage * drug.frequency * per_unit
                acetaminophen_drugs.append(drug)

            if drug.given_unit and _norm(drug.given_unit) != _norm(drug.unit):
                alerts.append(
                    _alert(
                        "dosage",
                        "minor",
                        [drug.name],
                        f"Unit mismatch: {drug.name}",
                        f"{drug.name} is normally dosed in {drug.unit}, but {drug.given_unit} was entered.",
                        "Confirm the unit before ordering.",
                        drug.is_candidate,
                        "DOSE-UNIT",
                    )
                )
            elif drug.dosage is not None:
                if drug.dosage > drug.max:
                    alerts.append(
                        _alert(
                            "dosage",
                            "major",
                            [drug.name],
                            f"Dose too high: {drug.name}",
                            f"{_fmt(drug.dosage)} {drug.unit} exceeds the usual maximum single dose of "
                            f"{_fmt(drug.max)} {drug.unit}.",
                            f"Reduce the dose to {_fmt(drug.min)}-{_fmt(drug.max)} {drug.unit}.",
                            drug.is_candidate,
                            "DOSE-HIGH",
                        )
                    )
                elif drug.dosage < drug.min:
                    alerts.append(
                        _alert(
                            "dosage",
                            "minor",
                            [drug.name],
                            f"Dose below usual range: {drug.name}",
                            f"{_fmt(drug.dosage)} {drug.unit} is below the usual minimum single dose of "
                            f"{_fmt(drug.min)} {drug.unit}.",
                            f"Usual range is {_fmt(drug.min)}-{_fmt(drug.max)} {drug.unit}.",
                            drug.is_candidate,
                            "DOSE-LOW",
                        )
                    )

            if (
                drug.max_daily is not None
                and not per_unit
                and drug.dosage is not None
                and drug.frequency is not None
            ):
                daily = drug.dosage * drug.frequency
                if daily > drug.max_daily:
                    alerts.append(
                        _alert(
                            "dosage",
                            "major",
                            [drug.name],
                            f"Daily dose too high: {drug.name}",
                            f"{_fmt(daily)} {drug.unit}/day exceeds the usual daily maximum of "
                            f"{_fmt(drug.max_daily)} {drug.unit}.",
                            "Reduce the dose or frequency.",
                            drug.is_candidate,
                            "DOSE-DAILY",
                        )
                    )

        limit = self.kb.limits.get("acetaminophen_max_daily_mg")
        if limit and acetaminophen_total > limit:
            alerts.append(
                _alert(
                    "dosage",
                    "major",
                    [d.name for d in acetaminophen_drugs],
                    "Acetaminophen daily total too high",
                    f"Total acetaminophen across all medications is {_fmt(acetaminophen_total)} mg/day, "
                    f"above the {_fmt(limit)} mg/day limit. Risk of liver injury.",
                    "Reduce total acetaminophen intake from all sources.",
                    any(d.is_candidate for d in acetaminophen_drugs),
                    "DOSE-APAP",
                )
            )
        return alerts


def check_medications(
    medications: Optional[list] = None,
    candidate: Optional[dict] = None,
    allergies: Optional[list] = None,
) -> dict:
    """Convenience wrapper using the shared knowledge base."""
    return MedicationSafetyEngine().check(medications, candidate, allergies)
