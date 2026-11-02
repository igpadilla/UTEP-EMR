"""Pydantic models for medication safety checks and formulary queries."""

from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

SeverityLevel = Literal["minor", "moderate", "major", "contraindicated"]
AlertType = Literal["drug_interaction", "allergy", "duplicate_therapy", "dosage"]


class MedicationItem(BaseModel):
    """An individual medication order entry."""

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[int] = Field(None, ge=1, description="Formulary drug ID if known")
    name: Optional[str] = Field(None, max_length=150, description="Drug name or alias")
    dosage: Optional[float] = Field(None, ge=0, description="Dose per administration")
    unit: Optional[str] = Field(None, max_length=30, description="Unit of measurement (e.g., mg, mcg)")
    frequency: Optional[float] = Field(
        None, ge=0, description="Frequency in doses per day (e.g., 1 for daily, 2 for BID)"
    )


class MedicationCheckRequest(BaseModel):
    """Payload for medication safety and interaction checking."""

    model_config = ConfigDict(populate_by_name=True)

    patient_id: Optional[str] = Field(None, max_length=100, description="Optional patient reference ID")
    medications: List[MedicationItem] = Field(
        default_factory=list,
        max_length=50,
        alias="current_medications",
        description="Active medication list",
    )
    candidate: Optional[MedicationItem] = Field(
        None,
        alias="candidate_medication",
        description="New candidate medication being prescribed or considered",
    )
    allergies: List[str] = Field(
        default_factory=list,
        max_length=50,
        description="Patient documented allergy strings",
    )
    include_fda_details: bool = Field(
        default=False,
        description="Whether to query openFDA for official boxed warnings and label info",
    )


class FDAAdvisory(BaseModel):
    """External official FDA warning advisory."""

    drug: str
    boxed_warning: Optional[str] = None
    warnings: Optional[str] = None


class MedicationAlert(BaseModel):
    """Structured clinical alert returned by the safety engine."""

    id: str = Field(..., description="Unique alert identifier in the response (e.g. alert-1)")
    type: AlertType = Field(..., description="Category of safety alert")
    severity: SeverityLevel = Field(..., description="Clinical severity level")
    drugs: List[str] = Field(default_factory=list, description="Drugs involved in the alert")
    title: str = Field(..., description="Short summary title of the safety issue")
    description: str = Field(..., description="Detailed clinical description of the risk")
    recommendation: str = Field(..., description="Actionable clinical guidance or mitigation")
    involves_candidate: bool = Field(
        default=False,
        description="True if this alert directly involves the candidate medication",
    )
    rule_id: Optional[str] = None


class MedicationCheckResponse(BaseModel):
    """Comprehensive safety check report."""

    has_alerts: bool
    highest_severity: Optional[SeverityLevel] = None
    alerts: List[MedicationAlert] = Field(default_factory=list)
    checked_medications: List[str] = Field(default_factory=list)
    unrecognized_medications: List[str] = Field(default_factory=list)
    fda_advisories: Optional[List[FDAAdvisory]] = Field(
        default=None,
        description="Official FDA boxed warnings retrieved from openFDA if requested",
    )


class FormularyDrug(BaseModel):
    """Formulary drug catalog item."""

    id: int
    name: str
    aliases: List[str] = Field(default_factory=list)
    classes: List[str] = Field(default_factory=list)
    min: float
    max: float
    unit: str
    max_daily: Optional[float] = None
    acetaminophen_mg_per_unit: Optional[float] = None


class FormularyResponse(BaseModel):
    """Formulary catalog response."""

    total: int
    drugs: List[FormularyDrug]


class FDALabelResponse(BaseModel):
    """Full drug labeling and warnings fetched from openFDA."""

    queried_drug: str
    generic_names: List[str] = Field(default_factory=list)
    brand_names: List[str] = Field(default_factory=list)
    substance_names: List[str] = Field(default_factory=list)
    pharm_class_cs: List[str] = Field(default_factory=list)
    boxed_warning: Optional[str] = None
    warnings: Optional[str] = None
    drug_interactions_text: Optional[str] = None
    indications_and_usage: Optional[str] = None

