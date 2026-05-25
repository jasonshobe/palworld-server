import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.middleware.auth import AuthMiddleware, require_auth


def make_app(password: str | None):
    app = FastAPI()
    auth = AuthMiddleware(password=password)

    @app.get("/protected")
    def protected(token=require_auth(auth)):
        return {"ok": True}

    @app.post("/login")
    def login(body: dict, response=None):
        tok = auth.login(body.get("password", ""))
        if tok is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401)
        return {"token": tok}

    return app, auth


def test_no_password_allows_access():
    app, _ = make_app(password=None)
    client = TestClient(app)
    resp = client.get("/protected")
    assert resp.status_code == 200


def test_password_required_returns_401_without_token():
    app, _ = make_app(password="secret")
    client = TestClient(app)
    resp = client.get("/protected")
    assert resp.status_code == 401


def test_login_with_correct_password_returns_token():
    app, auth = make_app(password="secret")
    client = TestClient(app)
    resp = client.post("/login", json={"password": "secret"})
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_login_with_wrong_password_returns_none():
    _, auth = make_app(password="secret")
    assert auth.login("wrong") is None


def test_valid_token_allows_access():
    app, auth = make_app(password="secret")
    client = TestClient(app)
    token = auth.login("secret")
    resp = client.get("/protected", cookies={"session": token})
    assert resp.status_code == 200


def test_logout_invalidates_token():
    _, auth = make_app(password="secret")
    token = auth.login("secret")
    auth.logout(token)
    assert not auth.is_valid(token)
