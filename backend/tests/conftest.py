"""Pytest configuration and shared fixtures for backend tests."""

import os
import pytest
from fastapi.testclient import TestClient

# Ensure required environment variables exist before Settings() is instantiated
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "mock-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "mock-service-role-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "super-secret-jwt-key-for-test-suite-32chars")

from app.auth import get_current_user
from app.main import app


@pytest.fixture
def client():
    """TestClient without auth override (unauthenticated by default)."""
    return TestClient(app)


@pytest.fixture
def auth_client():
    """TestClient with get_current_user dependency overridden."""
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "user-test-uuid-1234",
        "email": "student@utep.edu",
        "role": "authenticated",
    }
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_current_user, None)
