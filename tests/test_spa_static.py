from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.spa_static import SpaStaticFiles


def _build_app(tmp_path):
    """Mount SpaStaticFiles over a directory mimicking a built frontend."""
    (tmp_path / "index.html").write_text("<!doctype html><title>SPA</title>")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log('hi')")

    app = FastAPI()
    app.mount("/", SpaStaticFiles(directory=str(tmp_path), html=True), name="static")
    return TestClient(app)


def test_serves_real_asset(tmp_path):
    client = _build_app(tmp_path)
    resp = client.get("/assets/app.js")
    assert resp.status_code == 200
    assert "console.log" in resp.text


def test_serves_index_at_root(tmp_path):
    client = _build_app(tmp_path)
    resp = client.get("/")
    assert resp.status_code == 200
    assert "SPA" in resp.text


def test_client_route_falls_back_to_index(tmp_path):
    """Direct navigation to a client-side route must serve index.html, not 404."""
    client = _build_app(tmp_path)
    resp = client.get("/config")
    assert resp.status_code == 200
    assert "SPA" in resp.text


def test_nested_client_route_falls_back_to_index(tmp_path):
    client = _build_app(tmp_path)
    resp = client.get("/saves/some/deep/route")
    assert resp.status_code == 200
    assert "SPA" in resp.text


def test_api_path_does_not_fall_back(tmp_path):
    """Unmatched /api paths should 404, not silently return the SPA shell."""
    client = _build_app(tmp_path)
    resp = client.get("/api/bogus")
    assert resp.status_code == 404
    assert "SPA" not in resp.text
