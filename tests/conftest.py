import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CONTROLLER_PASSWORD", "")
    from backend import main
    main.auth = __import__("backend.middleware.auth", fromlist=["AuthMiddleware"]).AuthMiddleware(password=None)
    main.server_manager = __import__("backend.services.server_manager", fromlist=["ServerManager"]).ServerManager()
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def client_with_auth(monkeypatch):
    monkeypatch.setenv("CONTROLLER_PASSWORD", "testpass")
    from backend import main
    main.auth = __import__("backend.middleware.auth", fromlist=["AuthMiddleware"]).AuthMiddleware(password="testpass")
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)
