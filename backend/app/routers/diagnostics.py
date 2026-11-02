from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..auth import get_current_user
from ..schemas.diagnostics import (
    DiagnosticCatalogItem,
    DiagnosticCatalogResponse,
    DiagnosticCategory,
    LabEvaluationRequest,
    LabEvaluationResponse,
)
from ..services.diagnostics import evaluate_lab_results, get_catalog_item, get_catalog_items

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("/catalog", response_model=DiagnosticCatalogResponse)
def list_catalog(
    category: Optional[DiagnosticCategory] = Query(None),
    q: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> DiagnosticCatalogResponse:
    items = [DiagnosticCatalogItem(**i) for i in get_catalog_items(category=category, query=q)]
    return DiagnosticCatalogResponse(total=len(items), items=items)


@router.get("/catalog/{test_code}", response_model=DiagnosticCatalogItem)
def get_catalog_entry(
    test_code: str,
    current_user: dict = Depends(get_current_user),
) -> DiagnosticCatalogItem:
    item = get_catalog_item(test_code)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Diagnostic test '{test_code}' not found in catalog",
        )
    return DiagnosticCatalogItem(**item)


@router.post("/evaluate-lab", response_model=LabEvaluationResponse)
def evaluate_lab(
    payload: LabEvaluationRequest,
    current_user: dict = Depends(get_current_user),
) -> LabEvaluationResponse:
    raw_values = [v.model_dump() for v in payload.values]
    result = evaluate_lab_results(payload.test_code, raw_values)
    return LabEvaluationResponse(**result)

