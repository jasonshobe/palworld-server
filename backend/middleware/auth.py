import secrets
from fastapi import Cookie, Depends, HTTPException


class AuthMiddleware:
    def __init__(self, password: str | None):
        self._password = password or None
        self._tokens: set[str] = set()

    @property
    def required(self) -> bool:
        return self._password is not None

    def login(self, password: str) -> str | None:
        if self._password is None or password != self._password:
            return None
        token = secrets.token_hex(32)
        self._tokens.add(token)
        return token

    def logout(self, token: str) -> None:
        self._tokens.discard(token)

    def is_valid(self, token: str | None) -> bool:
        if not self.required:
            return True
        return token in self._tokens


def require_auth(auth: AuthMiddleware):
    def dependency(session: str | None = Cookie(default=None)):
        if not auth.is_valid(session):
            raise HTTPException(status_code=401, detail="Unauthorized")
    return Depends(dependency)
