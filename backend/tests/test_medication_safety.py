"""Unit tests for the medication safety engine rules and logic."""

from app.services.medication_safety import check_medications


def test_safe_combination_produces_no_alerts():
    res = check_medications(
        medications=[
            {"name": "Lisinopril", "dosage": 10, "frequency": 1, "unit": "mg"},
            {"name": "Atorvastatin", "dosage": 20, "frequency": 1, "unit": "mg"},
        ],
        allergies=[],
    )
    assert res["has_alerts"] is False
    assert res["highest_severity"] is None
    assert len(res["alerts"]) == 0
    assert "Lisinopril" in res["checked_medications"]
    assert "Atorvastatin" in res["checked_medications"]
    assert res["unrecognized_medications"] == []


def test_pairwise_interaction_acei_and_k_sparing_diuretic():
    res = check_medications(
        medications=[{"name": "Lisinopril"}],
        candidate={"name": "Spironolactone"},
    )
    assert res["has_alerts"] is True
    assert res["highest_severity"] == "major"
    alerts = [a for a in res["alerts"] if a["type"] == "drug_interaction"]
    assert len(alerts) >= 1
    alert = alerts[0]
    assert alert["severity"] == "major"
    assert "Lisinopril" in alert["drugs"]
    assert "Spironolactone" in alert["drugs"]
    assert alert["involves_candidate"] is True


def test_pairwise_interaction_warfarin_and_nsaid():
    res = check_medications(
        medications=[{"name": "Warfarin"}, {"name": "Ibuprofen"}],
    )
    assert res["has_alerts"] is True
    alert = next(a for a in res["alerts"] if a["type"] == "drug_interaction")
    assert alert["severity"] == "major"
    assert "bleeding" in alert["description"].lower() or "bleeding" in alert["title"].lower()


def test_contraindicated_pde5_and_nitrate():
    res = check_medications(
        medications=[{"name": "Nitroglycerin"}],
        candidate={"name": "Sildenafil"},
    )
    assert res["highest_severity"] == "contraindicated"
    alert = next(a for a in res["alerts"] if a["severity"] == "contraindicated")
    assert alert["type"] == "drug_interaction"
    assert "Nitroglycerin" in alert["drugs"]
    assert "Sildenafil" in alert["drugs"]
    assert alert["involves_candidate"] is True


def test_contraindicated_ssri_and_maoi():
    res = check_medications(
        medications=[{"name": "Sertraline"}, {"name": "Phenelzine"}],
    )
    assert res["highest_severity"] == "contraindicated"
    alert = next(a for a in res["alerts"] if a["severity"] == "contraindicated")
    assert "serotonin" in alert["description"].lower() or "serotonin" in alert["title"].lower()


def test_specific_rule_wins_over_generic_class_rule():
    # Simvastatin + Clarithromycin is contraindicated (DDI-131), overriding generic statin rules (DDI-130)
    res = check_medications(
        medications=[{"name": "Simvastatin"}, {"name": "Clarithromycin"}],
    )
    assert res["highest_severity"] == "contraindicated"
    ddi = next(a for a in res["alerts"] if a["type"] == "drug_interaction")
    assert ddi["rule_id"] == "DDI-131"
    assert ddi["severity"] == "contraindicated"


def test_cyp2c19_interaction_clopidogrel_omeprazole_vs_pantoprazole():
    # Clopidogrel + Omeprazole -> Major interaction (DDI-100)
    res_omeprazole = check_medications(
        medications=[{"name": "Clopidogrel"}, {"name": "Omeprazole"}],
    )
    alerts_o = [a for a in res_omeprazole["alerts"] if a["type"] == "drug_interaction"]
    assert any(a["rule_id"] == "DDI-100" for a in alerts_o)

    # Clopidogrel + Pantoprazole -> Pantoprazole does not trigger DDI-100
    res_pantoprazole = check_medications(
        medications=[{"name": "Clopidogrel"}, {"name": "Pantoprazole"}],
    )
    alerts_p = [a for a in res_pantoprazole["alerts"] if a["type"] == "drug_interaction"]
    assert not any(a["rule_id"] == "DDI-100" for a in alerts_p)


def test_triple_whammy_acute_kidney_injury():
    # ACEI (Lisinopril) + Loop Diuretic (Furosemide) + NSAID (Ibuprofen)
    res = check_medications(
        medications=[
            {"name": "Lisinopril"},
            {"name": "Furosemide"},
            {"name": "Ibuprofen"},
        ]
    )
    assert res["has_alerts"] is True
    triple_alerts = [a for a in res["alerts"] if a.get("rule_id") == "DDI-005"]
    assert len(triple_alerts) == 1
    alert = triple_alerts[0]
    assert alert["severity"] == "major"
    assert set(alert["drugs"]) == {"Lisinopril", "Furosemide", "Ibuprofen"}


def test_duplicate_class_therapy():
    # Lisinopril + Enalapril -> both ACE inhibitors
    res = check_medications(
        medications=[{"name": "Lisinopril"}, {"name": "Enalapril"}],
    )
    dup_alerts = [a for a in res["alerts"] if a["type"] == "duplicate_therapy"]
    assert len(dup_alerts) >= 1
    assert any("ACE" in a["title"] for a in dup_alerts)


def test_duplicate_same_drug():
    # Same drug ordered twice
    res = check_medications(
        medications=[{"name": "Lisinopril", "dosage": 10}, {"name": "Lisinopril", "dosage": 20}],
    )
    dup_alerts = [a for a in res["alerts"] if a.get("rule_id") == "DUP-DRUG"]
    assert len(dup_alerts) == 1
    assert dup_alerts[0]["severity"] == "major"


def test_allergy_direct_and_cross_reactivity():
    # Penicillin allergy with Amoxicillin (contraindicated) and Cephalexin (moderate cross-reactivity)
    res = check_medications(
        medications=[{"name": "Amoxicillin"}, {"name": "Cephalexin"}],
        allergies=["Penicillin"],
    )
    allergy_alerts = [a for a in res["alerts"] if a["type"] == "allergy"]
    amox_alert = next(a for a in allergy_alerts if "Amoxicillin" in a["drugs"])
    ceph_alert = next(a for a in allergy_alerts if "Cephalexin" in a["drugs"])

    assert amox_alert["severity"] == "contraindicated"
    assert ceph_alert["severity"] == "moderate"


def test_allergy_sulfa_free_text():
    # Free-text "Patient has severe allergy to sulfa drugs" with Bactrim (Sulfamethoxazole/Trimethoprim)
    res = check_medications(
        medications=[{"name": "Sulfamethoxazole/Trimethoprim"}],
        allergies=["Patient has severe allergy to sulfa drugs"],
    )
    allergy_alerts = [a for a in res["alerts"] if a["type"] == "allergy"]
    assert len(allergy_alerts) >= 1
    assert allergy_alerts[0]["severity"] == "contraindicated"


def test_allergy_direct_drug_name_and_alias():
    # Allergy explicitly stating "Allergic to Zestril" (brand name for Lisinopril)
    res = check_medications(
        medications=[{"name": "Lisinopril"}],
        allergies=["Allergic to Zestril"],
    )
    allergy_alerts = [a for a in res["alerts"] if a["type"] == "allergy"]
    assert len(allergy_alerts) >= 1
    assert allergy_alerts[0]["severity"] == "contraindicated"


def test_dosage_checks_high_low_and_unit_mismatch():
    # Lisinopril normal is 2.5 - 40 mg
    res_high = check_medications(medications=[{"name": "Lisinopril", "dosage": 80, "unit": "mg"}])
    assert any(a["rule_id"] == "DOSE-HIGH" for a in res_high["alerts"])

    res_low = check_medications(medications=[{"name": "Lisinopril", "dosage": 1.0, "unit": "mg"}])
    assert any(a["rule_id"] == "DOSE-LOW" for a in res_low["alerts"])

    res_unit = check_medications(medications=[{"name": "Lisinopril", "dosage": 10, "unit": "grams"}])
    assert any(a["rule_id"] == "DOSE-UNIT" for a in res_unit["alerts"])


def test_dosage_daily_limit_exceeded():
    # Metformin max daily is 2550 mg. 1000 mg x 3 daily = 3000 mg
    res = check_medications(
        medications=[{"name": "Metformin", "dosage": 1000, "frequency": 3, "unit": "mg"}]
    )
    daily_alerts = [a for a in res["alerts"] if a.get("rule_id") == "DOSE-DAILY"]
    assert len(daily_alerts) == 1
    assert daily_alerts[0]["severity"] == "major"


def test_cumulative_acetaminophen_overdose():
    # Acetaminophen max daily is 4000 mg across all products.
    # Hydrocodone/Acetaminophen (325mg APAP per tablet) 2 tabs x 4 = 2600 mg
    # Acetaminophen 1000mg x 2 daily = 2000 mg
    # Total = 4600 mg (> 4000 mg)
    res = check_medications(
        medications=[
            {"name": "Hydrocodone/Acetaminophen", "dosage": 2, "frequency": 4, "unit": "tablets"},
            {"name": "Acetaminophen", "dosage": 1000, "frequency": 2, "unit": "mg"},
        ]
    )
    apap_alerts = [a for a in res["alerts"] if a.get("rule_id") == "DOSE-APAP"]
    assert len(apap_alerts) == 1
    assert apap_alerts[0]["severity"] == "major"
    assert "4600" in apap_alerts[0]["description"]


def test_unrecognized_medication_reporting():
    res = check_medications(
        medications=[{"name": "MadeUpDrugThatDoesNotExist", "dosage": 100}],
    )
    assert "MadeUpDrugThatDoesNotExist" in res["unrecognized_medications"]
    assert len(res["checked_medications"]) == 0
