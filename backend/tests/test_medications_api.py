"""Integration tests for FastAPI medication interaction and formulary endpoints."""


def test_endpoints_require_authentication(client):
    res_check = client.post("/api/medications/check-interactions", json={"medications": []})
    assert res_check.status_code == 401

    res_formulary = client.get("/api/medications/formulary")
    assert res_formulary.status_code == 401


def test_check_interactions_authenticated(auth_client):
    payload = {
        "medications": [
            {"name": "Lisinopril", "dosage": 20, "unit": "mg", "frequency": 1}
        ],
        "candidate": {
            "name": "Spironolactone",
            "dosage": 25,
            "unit": "mg",
            "frequency": 1,
        },
        "allergies": ["Penicillin"],
    }
    response = auth_client.post("/api/medications/check-interactions", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["has_alerts"] is True
    assert data["highest_severity"] == "major"
    assert len(data["alerts"]) >= 1

    first_alert = data["alerts"][0]
    assert "id" in first_alert
    assert "type" in first_alert
    assert "severity" in first_alert
    assert "drugs" in first_alert
    assert "title" in first_alert
    assert "description" in first_alert
    assert "recommendation" in first_alert
    assert "involves_candidate" in first_alert
    assert first_alert["involves_candidate"] is True


def test_check_interactions_supports_aliases(auth_client):
    # Tests current_medications and candidate_medication field aliases
    payload = {
        "current_medications": [{"name": "Warfarin", "dosage": 5, "unit": "mg"}],
        "candidate_medication": {"name": "Ibuprofen", "dosage": 400, "unit": "mg"},
        "allergies": [],
    }
    response = auth_client.post("/api/medications/check-interactions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["has_alerts"] is True
    assert data["highest_severity"] == "major"
    assert any("Warfarin" in a["drugs"] and "Ibuprofen" in a["drugs"] for a in data["alerts"])


def test_check_interactions_invalid_payload_returns_422(auth_client):
    # Negative dosage should fail validation
    payload = {
        "medications": [{"name": "Lisinopril", "dosage": -50}],
    }
    response = auth_client.post("/api/medications/check-interactions", json=payload)
    assert response.status_code == 422


def test_get_formulary_full(auth_client):
    response = auth_client.get("/api/medications/formulary")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 100
    assert len(data["drugs"]) == data["total"]

    first_drug = data["drugs"][0]
    assert "id" in first_drug
    assert "name" in first_drug
    assert "min" in first_drug
    assert "max" in first_drug
    assert "unit" in first_drug
    assert "classes" in first_drug


def test_get_formulary_search_by_name(auth_client):
    response = auth_client.get("/api/medications/formulary?q=lisinopril")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    names = [d["name"] for d in data["drugs"]]
    assert "Lisinopril" in names


def test_get_formulary_search_by_alias(auth_client):
    # Zestril is an alias for Lisinopril
    response = auth_client.get("/api/medications/formulary?q=zestril")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    names = [d["name"] for d in data["drugs"]]
    assert "Lisinopril" in names


def test_openfda_label_requires_auth(client):
    res = client.get("/api/medications/openfda/label?drug=lisinopril")
    assert res.status_code == 401


def test_openfda_label_authenticated(auth_client):
    res = auth_client.get("/api/medications/openfda/label?drug=lisinopril")
    assert res.status_code == 200
    data = res.json()
    assert data["queried_drug"] == "lisinopril"
    assert "generic_names" in data
    assert "boxed_warning" in data
    assert "drug_interactions_text" in data


def test_openfda_label_not_found(auth_client):
    res = auth_client.get("/api/medications/openfda/label?drug=completelyfakedrugxyz123")
    assert res.status_code == 404


def test_check_interactions_with_openfda_advisories(auth_client):
    payload = {
        "candidate": {"name": "Warfarin", "dosage": 5, "unit": "mg"},
        "medications": [],
        "allergies": [],
        "include_fda_details": True,
    }
    res = auth_client.post("/api/medications/check-interactions", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["fda_advisories"] is not None
    assert any(adv["drug"] == "Warfarin" for adv in data["fda_advisories"])

