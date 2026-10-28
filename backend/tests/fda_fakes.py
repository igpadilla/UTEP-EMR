"""Small stand-ins for openFDA responses, shared by the medication tests."""


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


def fda_label(generic, boxed=None, interactions=None):
    """A minimal openFDA label result."""
    item = {"openfda": {"generic_name": [generic.upper()], "brand_name": [generic.title()]}}
    if boxed:
        item["boxed_warning"] = [boxed]
    if interactions:
        item["drug_interactions"] = [interactions]
    return {"results": [item]}
