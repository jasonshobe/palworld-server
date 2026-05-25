import os
from fastapi import APIRouter, HTTPException, Response
from backend.models.auth import LoginRequest, AuthStatus

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_auth():
    from backend.main import auth
    return auth


@router.get("/status", response_model=AuthStatus)
def auth_status():
    return AuthStatus(required=get_auth().required)


@router.post("/login")
def login(body: LoginRequest, response: Response):
    token = get_auth().login(body.password)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid password")
    response.set_cookie("session", token, httponly=True, samesite="strict")
    return {"ok": True}


@router.post("/logout")
def logout(response: Response, session: str | None = None):
    from fastapi import Cookie
    if session:
        get_auth().logout(session)
    response.delete_cookie("session")
    return {"ok": True}
