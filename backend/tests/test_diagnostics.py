def test_catalog_requires_auth(client):
    res = client.get("/api/diagnostics/catalog")
    assert res.status_code in (401, 403)


def test_list_and_filter_catalog(auth_client):
    res = auth_client.get("/api/diagnostics/catalog")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 10

    labs = auth_client.get("/api/diagnostics/catalog?category=lab").json()
    assert all(i["category"] == "lab" for i in labs["items"])

    imaging = auth_client.get("/api/diagnostics/catalog?category=imaging&q=chest").json()
    assert imaging["total"] >= 1
    assert any(i["code"] == "cxr_pa_lat" for i in imaging["items"])


def test_get_catalog_entry(auth_client):
    res = auth_client.get("/api/diagnostics/catalog/cbc")
    assert res.status_code == 200
    assert res.json()["clinical_code"] == "58410-2"

    missing = auth_client.get("/api/diagnostics/catalog/unknown_test")
    assert missing.status_code == 404


def test_evaluate_lab_flags(auth_client):
    res = auth_client.post(
        "/api/diagnostics/evaluate-lab",
        json={
            "test_code": "cbc",
            "values": [
                {"code": "wbc", "value": 7.5},
                {"code": "hgb", "value": 10.2},
                {"code": "plt", "value": 40.0},
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["overall_flag"] == "critical"
    assert data["has_abnormal"] is True
    assert data["has_critical"] is True

    flags = {a["code"]: a["flag"] for a in data["analytes"]}
    assert flags == {"wbc": "normal", "hgb": "low", "plt": "critical_low"}

