import pytest
from fastapi.testclient import TestClient

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
