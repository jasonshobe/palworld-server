from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles


class SpaStaticFiles(StaticFiles):
    """StaticFiles that serves the SPA shell for unmatched client-side routes.

    The frontend uses HTML5 history routing (react-router BrowserRouter), so
    paths like ``/config`` or ``/saves`` have no file on disk. A direct browser
    navigation to one of these requests it from the server; plain StaticFiles
    would 404. Instead we fall back to ``index.html`` so the client router can
    take over. Requests under ``/api`` are never rewritten — they should keep
    returning real 404s.
    """

    async def get_response(self, path: str, scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code == 404 and not path.startswith("api"):
                return await super().get_response("index.html", scope)
            raise
