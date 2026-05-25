import asyncio
from collections import deque
from pathlib import Path

from backend.models.server import ServerState

STEAMCMD_PATH = "/home/steam/steamcmd/steamcmd.sh"
PALWORLD_DIR = "/palworld"
PALWORLD_BINARY = "/palworld/PalServer.sh"
STEAMAPP_ID = "2394010"


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
        self._logs.append(line)

    async def _tail_output(self, process: asyncio.subprocess.Process) -> None:
        async for line in process.stdout:
            self._push_log(line.decode().rstrip())
        await process.wait()
        if self.state == ServerState.RUNNING:
            self._push_log(f"[controller] Server exited (code {process.returncode})")
            self.state = ServerState.STOPPED
        self._process = None

    async def update(self) -> None:
        if self.state != ServerState.STOPPED:
            raise RuntimeError("Server must be stopped before updating")
        self.state = ServerState.UPDATING
        try:
            self._push_log("[controller] Starting SteamCMD update...")
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
                self._push_log(line.decode().rstrip())
            await proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f"SteamCMD failed (code {proc.returncode})")
            self._push_log("[controller] Update complete.")
        finally:
            self.state = ServerState.STOPPED

    async def start(self, extra_args: list[str] | None = None) -> None:
        if self.state != ServerState.STOPPED:
            raise RuntimeError(f"Cannot start: server is {self.state}")

        if not Path(PALWORLD_BINARY).exists():
            await self.update()

        self.state = ServerState.STARTING
        self._push_log("[controller] Starting Palworld server...")

        args = [
            PALWORLD_BINARY,
            "-useperfthreads",
            "-NoAsyncLoadingThread",
            "-UseMultithreadForDS",
        ]
        if extra_args:
            args.extend(extra_args)

        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
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
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=30.0)
            except asyncio.TimeoutError:
                self._push_log("[controller] Graceful shutdown timed out, killing...")
                self._process.kill()
                await self._process.wait()
        finally:
            self._push_log("[controller] Server stopped.")
            self.state = ServerState.STOPPED
            self._process = None
