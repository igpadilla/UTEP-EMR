"""Router for medication safety checking, formulary queries, and openFDA enrichment."""

from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..auth import get_current_user
from ..schemas.medications import (
    FDAAdvisory,
    FDALabelResponse,
    FormularyDrug,
    FormularyResponse,
    MedicationCheckRequest,
    MedicationCheckResponse,
)
from ..services.medication_safety import check_medications, get_knowledge_base
from ..services.openfda import fetch_fda_label

router = APIRouter(prefix="/api/medications", tags=["medications"])


@router.post(
    "/check-interactions",
    response_model=MedicationCheckResponse,
    summary="Check medications for drug-drug interactions, allergy conflicts, duplicates, and dose limits",
)
def check_medication_safety(
    payload: MedicationCheckRequest,
    current_user: dict = Depends(get_current_user),
) -> MedicationCheckResponse:
    """Evaluate a regimen and optional candidate drug against the clinical safety knowledge base."""
    # Convert Pydantic models to dicts for the engine
    meds_data = [m.model_dump(exclude_none=True) for m in payload.medications]
    candidate_data = (
        payload.candidate.model_dump(exclude_none=True) if payload.candidate else None
    )

    result = check_medications(
        medications=meds_data,
        candidate=candidate_data,
        allergies=payload.allergies,
    )

    # Optional openFDA official boxed warning enrichment
    fda_advisories: Optional[List[FDAAdvisory]] = None
    if payload.include_fda_details:
        advisories = []
        target_drugs = []
        if payload.candidate and payload.candidate.name:
            target_drugs.append(payload.candidate.name)
        for m in payload.medications:
            if m.name and m.name not in target_drugs:
                target_drugs.append(m.name)

        # Query openFDA for up to 3 drugs to keep response quick
        for drug_name in target_drugs[:3]:
            fda_data = fetch_fda_label(drug_name)
            if fda_data and (fda_data.get("boxed_warning") or fda_data.get("warnings")):
                advisories.append(
                    FDAAdvisory(
                        drug=drug_name,
                        boxed_warning=fda_data.get("boxed_warning"),
                        warnings=fda_data.get("warnings"),
                    )
                )
        if advisories:
            fda_advisories = advisories

    result["fda_advisories"] = fda_advisories
    return MedicationCheckResponse(**result)


@router.get(
    "/formulary",
    response_model=FormularyResponse,
    summary="List or search educational formulary drugs",
)
def get_formulary(
    q: Optional[str] = Query(None, description="Optional search term to filter drugs by name or alias"),
    current_user: dict = Depends(get_current_user),
) -> FormularyResponse:
    """Retrieve formulary medications with dosage limits and classes for clinical simulation."""
    kb = get_knowledge_base()
    drugs = kb.drugs

    if q:
        query = q.strip().lower()
        drugs = [
            d
            for d in drugs
            if query in d["name"].lower()
            or any(query in alias.lower() for alias in d.get("aliases", []))
            or any(query in cls.lower() for cls in d.get("classes", []))
        ]

    formatted = [
        FormularyDrug(
            id=d["id"],
            name=d["name"],
            aliases=d.get("aliases", []),
            classes=d.get("classes", []),
            min=d["min"],
            max=d["max"],
            unit=d["unit"],
            max_daily=d.get("max_daily"),
            acetaminophen_mg_per_unit=d.get("acetaminophen_mg_per_unit"),
        )
        for d in drugs
    ]
    return FormularyResponse(total=len(formatted), drugs=formatted)


@router.get(
    "/openfda/label",
    response_model=FDALabelResponse,
    summary="Fetch official FDA drug labeling, boxed warnings, and interactions from openFDA",
)
def get_openfda_label(
    drug: str = Query(..., min_length=2, description="Drug name (brand or generic) to query"),
    current_user: dict = Depends(get_current_user),
) -> FDALabelResponse:
    """Query the official U.S. FDA openFDA API for labeling, boxed warnings, and interactions."""
    data = fetch_fda_label(drug)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No official FDA drug labeling found on openFDA for '{drug}'",
        )
    return FDALabelResponse(**data)
