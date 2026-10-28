"""Tests for the openFDA lookup: what it remembers, what it never remembers, and how it escapes names.

Every test here uses a stand-in for openFDA, so none of them touch the network.
"""

import httpx

from app.services import openfda
from app.services.openfda import fetch_fda_label

from fda_fakes import FakeResponse, fda_label


def test_a_timeout_is_not_remembered(fake_openfda):
    def handler(search, n):
        if n == 1:
            raise httpx.ConnectTimeout("simulated outage")
        return FakeResponse(200, fda_label("lisinopril", boxed="WARNING: FETAL TOXICITY"))

    searches = fake_openfda(handler)
    assert fetch_fda_label("lisinopril") is None  # the outage
    result = fetch_fda_label("lisinopril")  # FDA is back: must ask again
    assert result is not None and result["boxed_warning"] == "WARNING: FETAL TOXICITY"
    assert len(searches) == 2


def test_an_error_status_is_not_remembered(fake_openfda):
    searches = fake_openfda(
        lambda search, n: FakeResponse(503) if n == 1 else FakeResponse(200, fda_label("warfarin"))
    )
    assert fetch_fda_label("warfarin") is None
    assert fetch_fda_label("warfarin") is not None
    assert len(searches) == 2


def test_a_found_label_is_remembered(fake_openfda):
    searches = fake_openfda(lambda search, n: FakeResponse(200, fda_label("warfarin")))
    first = fetch_fda_label("warfarin")
    second = fetch_fda_label("warfarin")
    assert first == second and first is not None
    assert len(searches) == 1


def test_a_confirmed_unknown_drug_is_remembered(fake_openfda):
    searches = fake_openfda(lambda search, n: FakeResponse(404, {"error": {"code": "NOT_FOUND"}}))
    assert fetch_fda_label("notadrug") is None
    asked = len(searches)
    assert fetch_fda_label("notadrug") is None
    assert len(searches) == asked  # no new requests


def test_falls_back_to_the_substance_name(fake_openfda):
    def handler(search, n):
        if "substance_name" in search:
            return FakeResponse(200, fda_label("acetaminophen"))
        return FakeResponse(404, {"error": {"code": "NOT_FOUND"}})

    searches = fake_openfda(handler)
    assert fetch_fda_label("acetaminophen") is not None
    assert "substance_name" in searches[-1]


def test_a_quote_in_the_name_cannot_break_out_of_the_search(fake_openfda):
    searches = fake_openfda(lambda search, n: FakeResponse(404))
    fetch_fda_label('x" OR _exists_:boxed_warning OR "y')
    assert searches, "expected a search to be sent"
    for search in searches:
        # every quote that came from the user is escaped, so the phrase stays closed
        assert '\\"' in search
        assert '" OR _exists_' not in search.replace('\\"', "")


def test_short_names_never_reach_the_network(fake_openfda):
    searches = fake_openfda(lambda search, n: FakeResponse(200, fda_label("x")))
    assert fetch_fda_label(" a ") is None
    assert searches == []


def test_the_cache_is_bounded(fake_openfda):
    fake_openfda(lambda search, n: FakeResponse(404))
    for i in range(openfda._CACHE_MAX_ENTRIES + 20):
        fetch_fda_label(f"drug{i:04d}")
    assert len(openfda._cache) <= openfda._CACHE_MAX_ENTRIES
