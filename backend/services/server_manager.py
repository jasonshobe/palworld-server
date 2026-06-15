import asyncio
import os
import re
import shlex
import signal
from collections import deque
from pathlib import Path

from backend.models.server import ServerState

STEAMCMD_PATH = "/home/steam/steamcmd/steamcmd.sh"
PALWORLD_DIR = "/palworld"
PALWORLD_BINARY = "/palworld/PalServer.sh"
STEAMAPP_ID = "2394010"
# On a fresh install SteamCMD updates itself and restarts mid-session; the
# first app_update after that restart fails with "Missing configuration".
# Re-running succeeds, so retry the whole invocation a few times.
STEAMCMD_MAX_ATTEMPTS = 3

# SteamCMD emits ANSI color escape sequences; strip them from log output.
_ANSI_RE = re.compile(r"\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text)


class ServerManager:
    def __init__(self):
        self.state = ServerState.STOPPED
        self._process: asyncio.subprocess.Process | None = None
        self._logs: deque[str] = deque(maxlen=1000)
        self._tail_task: asyncio.Task | None = None

    @property
    def logs(self) -> list[str]:
        return list(self._logs)[-100:]

    def _push_log(self, line: str) -> None:
        self._logs.append(_strip_ansi(line).rstrip())

    async def _tail_output(self, process: asyncio.subprocess.Process) -> None:
        async for line in process.stdout:
            self._push_log(line.decode())
        await process.wait()
        if self.state == ServerState.RUNNING:
            self._push_log(f"[controller] Server exited (code {process.returncode})")
            self.state = ServerState.STOPPED
        self._process = None

    async def _run_steamcmd(self) -> int:
        proc = await asyncio.create_subprocess_exec(
            STEAMCMD_PATH,
            "+force_install_dir", PALWORLD_DIR,
            "+login", "anonymous",
            "+app_update", STEAMAPP_ID, "validate",
            "+quit",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        async for line in proc.stdout:
            self._push_log(line.decode())
        await proc.wait()
        return proc.returncode

    async def update(self) -> None:
        if self.state != ServerState.STOPPED:
            raise RuntimeError("Server must be stopped before updating")
        self.state = ServerState.UPDATING
        try:
            for attempt in range(1, STEAMCMD_MAX_ATTEMPTS + 1):
                self._push_log(
                    f"[controller] Starting SteamCMD update "
                    f"(attempt {attempt}/{STEAMCMD_MAX_ATTEMPTS})..."
                )
                returncode = await self._run_steamcmd()
                if returncode == 0:
                    self._push_log("[controller] Update complete.")
                    return
                self._push_log(
                    f"[controller] SteamCMD exited with code {returncode}."
                )
            raise RuntimeError(
                f"SteamCMD failed after {STEAMCMD_MAX_ATTEMPTS} attempts"
            )
        finally:
            self.state = ServerState.STOPPED

    async def start(self, extra_args: list[str] | None = None) -> None:
        if self.state != ServerState.STOPPED:
            raise RuntimeError(f"Cannot start: server is {self.state}")

        if not Path(PALWORLD_BINARY).exists():
            await self.update()

        self.state = ServerState.STARTING
        self._push_log("[controller] Starting Palworld server...")

        try:
            import backend.main as _main
            _main.mod_manager.sync(self._push_log)
            env_opts = shlex.split(os.environ.get("PALWORLD_OPTS", ""))
            args = [
                PALWORLD_BINARY,
                "-useperfthreads",
                "-NoAsyncLoadingThread",
                "-UseMultithreadForDS",
                *(extra_args or []),
                *env_opts,
            ]
            # PALWORLD_BINARY is PalServer.sh, a wrapper that launches the real
            # PalServer-Linux-Shipping binary *without* exec. Run it in its own
            # session (new process group) so stop() can signal the whole tree;
            # otherwise SIGTERM only hits the wrapper and the game binary is
            # orphaned, keeps autosaving, and silently overwrites save edits.
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,
            )
            self._process = proc
            self.state = ServerState.RUNNING
            self._tail_task = asyncio.create_task(self._tail_output(proc))
        except Exception:
            self.state = ServerState.STOPPED
            raise

    async def stop(self) -> None:
        if self.state != ServerState.RUNNING:
            raise RuntimeError(f"Cannot stop: server is {self.state}")

        self.state = ServerState.STOPPING
        self._push_log("[controller] Stopping Palworld server...")

        try:
            # Signal the whole process group (wrapper shell + game binary), not
            # just the wrapper, so the game binary actually shuts down (it saves
            # cleanly on SIGTERM) instead of being orphaned to PID 1.
            try:
                pgid = os.getpgid(self._process.pid)
            except ProcessLookupError:
                pgid = None

            if pgid is not None:
                os.killpg(pgid, signal.SIGTERM)
                try:
                    await asyncio.wait_for(self._process.wait(), timeout=30.0)
                except asyncio.TimeoutError:
                    self._push_log("[controller] Graceful shutdown timed out, killing...")
                    try:
                        os.killpg(pgid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    await self._process.wait()
        finally:
            self._push_log("[controller] Server stopped.")
            self.state = ServerState.STOPPED
            self._process = None
