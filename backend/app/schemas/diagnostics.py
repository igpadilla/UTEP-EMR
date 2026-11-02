from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

DiagnosticCategory = Literal["lab", "imaging"]
AnalyteFlag = Literal["normal", "low", "high", "critical_low", "critical_high"]
OverallFlag = Literal["normal", "abnormal", "critical"]


class AnalyteDefinition(BaseModel):
    code: str
    name: str
    unit: str
    low: Optional[float] = None
    high: Optional[float] = None
    critical_low: Optional[float] = None
    critical_high: Optional[float] = None


class DiagnosticCatalogItem(BaseModel):
    code: str
    name: str
    category: DiagnosticCategory
    coding_system: Literal["LOINC", "CPT"]
    clinical_code: str
    specimen_or_modality: str
    aliases: List[str] = Field(default_factory=list)
    analytes: List[AnalyteDefinition] = Field(default_factory=list)


class DiagnosticCatalogResponse(BaseModel):
    total: int
    items: List[DiagnosticCatalogItem]


class AnalyteValueInput(BaseModel):
    code: str
    name: Optional[str] = None
    value: float
    unit: Optional[str] = None


class EvaluatedAnalyte(BaseModel):
    code: str
    name: str
    value: float
    unit: str
    reference_range: str
    flag: AnalyteFlag


class LabEvaluationRequest(BaseModel):
    test_code: str
    values: List[AnalyteValueInput] = Field(default_factory=list)


class LabEvaluationResponse(BaseModel):
    test_code: str
    overall_flag: OverallFlag
    has_abnormal: bool
    has_critical: bool
    analytes: List[EvaluatedAnalyte]

