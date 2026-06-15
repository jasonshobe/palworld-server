import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from backend.services.server_manager import ServerManager, ServerState


@pytest.fixture
def manager():
    return ServerManager()


def test_initial_state_is_stopped(manager):
    assert manager.state == ServerState.STOPPED


def test_logs_empty_on_init(manager):
    assert manager.logs == []


def test_logs_returns_last_100_lines(manager):
    for i in range(150):
        manager._push_log(f"line {i}")
    logs = manager.logs
    assert len(logs) == 100
    assert logs[0] == "line 50"
    assert logs[-1] == "line 149"


@pytest.mark.asyncio
async def test_start_raises_if_not_stopped(manager):
    manager.state = ServerState.RUNNING
    with pytest.raises(RuntimeError, match="Cannot start"):
        await manager.start()


@pytest.mark.asyncio
async def test_stop_raises_if_not_running(manager):
    with pytest.raises(RuntimeError, match="Cannot stop"):
        await manager.stop()


@pytest.mark.asyncio
async def test_update_raises_if_not_stopped(manager):
    manager.state = ServerState.RUNNING
    with pytest.raises(RuntimeError, match="must be stopped"):
        await manager.update()


@pytest.mark.asyncio
async def test_start_sets_running_state(manager, tmp_path):
    import backend.main as main
    binary = tmp_path / "PalServer.sh"
    binary.touch()

    mock_proc = MagicMock()
    mock_proc.stdout.readline = AsyncMock(return_value=b"")
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.returncode = 0

    with patch("backend.services.server_manager.PALWORLD_BINARY", str(binary)), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
         patch.object(main, "mod_manager", MagicMock()):
        await manager.start()

    assert manager.state == ServerState.RUNNING


@pytest.mark.asyncio
async def test_start_launches_in_new_session(manager, tmp_path):
    # PalServer.sh is a wrapper that launches the real binary without `exec`.
    # The server must run in its own session/process group so stop() can signal
    # the whole tree; otherwise the game binary is orphaned on stop and keeps
    # autosaving over save edits.
    import backend.main as main
    binary = tmp_path / "PalServer.sh"
    binary.touch()

    mock_proc = MagicMock()
    mock_proc.stdout.readline = AsyncMock(return_value=b"")
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.returncode = 0

    with patch("backend.services.server_manager.PALWORLD_BINARY", str(binary)), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc) as spawn, \
         patch.object(main, "mod_manager", MagicMock()):
        await manager.start()

    assert spawn.call_args.kwargs.get("start_new_session") is True


@pytest.mark.asyncio
async def test_stop_signals_whole_process_group_and_sets_stopped(manager):
    # Must SIGTERM the process group (the wrapper shell + the orphan-prone game
    # binary), not just the wrapper, so the binary actually shuts down.
    import signal
    mock_proc = MagicMock()
    mock_proc.pid = 4321
    mock_proc.wait = AsyncMock(return_value=0)
    manager.state = ServerState.RUNNING
    manager._process = mock_proc

    with patch("os.getpgid", return_value=4321) as getpgid, \
         patch("os.killpg") as killpg:
        await manager.stop()

    assert manager.state == ServerState.STOPPED
    getpgid.assert_called_once_with(4321)
    killpg.assert_called_once_with(4321, signal.SIGTERM)


@pytest.mark.asyncio
async def test_stop_sigkills_group_on_graceful_timeout(manager):
    import signal
    mock_proc = MagicMock()
    mock_proc.pid = 4321
    # First wait (graceful) times out; second wait (after SIGKILL) returns.
    mock_proc.wait = AsyncMock(side_effect=[asyncio.TimeoutError(), 0])
    manager.state = ServerState.RUNNING
    manager._process = mock_proc

    async def fake_wait_for(coro, timeout):
        return await coro  # let the AsyncMock side_effect drive the outcome

    with patch("os.getpgid", return_value=4321), \
         patch("os.killpg") as killpg, \
         patch("asyncio.wait_for", side_effect=fake_wait_for):
        await manager.stop()

    assert manager.state == ServerState.STOPPED
    assert killpg.call_args_list == [
        ((4321, signal.SIGTERM),),
        ((4321, signal.SIGKILL),),
    ]


@pytest.mark.asyncio
async def test_stop_when_process_already_gone(manager):
    # If the group is already gone, stop() must still settle to STOPPED.
    mock_proc = MagicMock()
    mock_proc.pid = 4321
    mock_proc.wait = AsyncMock(return_value=0)
    manager.state = ServerState.RUNNING
    manager._process = mock_proc

    with patch("os.getpgid", side_effect=ProcessLookupError()):
        await manager.stop()

    assert manager.state == ServerState.STOPPED


@pytest.mark.asyncio
async def test_update_runs_steamcmd_and_returns_to_stopped(manager):
    async def mock_stdout():
        for line in [b"Downloading...\n", b"Success.\n"]:
            yield line

    real_proc = MagicMock()
    real_proc.stdout = mock_stdout()
    real_proc.wait = AsyncMock(return_value=0)
    real_proc.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=real_proc):
        await manager.update()

    assert manager.state == ServerState.STOPPED
    assert any("Downloading" in line for line in manager.logs)


def _steamcmd_proc(returncode, lines):
    async def mock_stdout():
        for line in lines:
            yield line

    proc = MagicMock()
    proc.stdout = mock_stdout()
    proc.wait = AsyncMock(return_value=returncode)
    proc.returncode = returncode
    return proc


@pytest.mark.asyncio
async def test_update_retries_when_steamcmd_fails_then_succeeds(manager):
    # First run mimics the self-update race: steamcmd restarts and the
    # app_update fails with "Missing configuration" (nonzero exit). The
    # second run succeeds.
    procs = [
        _steamcmd_proc(8, [b"ERROR! Failed to install app '2394010' (Missing configuration)\n"]),
        _steamcmd_proc(0, [b"Success! App '2394010' fully installed.\n"]),
    ]

    with patch("asyncio.create_subprocess_exec", side_effect=procs) as spawn:
        await manager.update()

    assert spawn.call_count == 2
    assert manager.state == ServerState.STOPPED
    assert any("fully installed" in line for line in manager.logs)


@pytest.mark.asyncio
async def test_update_raises_after_exhausting_retries(manager):
    procs = [_steamcmd_proc(8, [b"ERROR! Missing configuration\n"]) for _ in range(10)]

    with patch("asyncio.create_subprocess_exec", side_effect=procs):
        with pytest.raises(RuntimeError, match="SteamCMD failed"):
            await manager.update()

    assert manager.state == ServerState.STOPPED


def test_push_log_strips_ansi_color_codes(manager):
    manager._push_log("Loading Steam API...\x1b[0mOK\x1b[0m")
    assert manager.logs[-1] == "Loading Steam API...OK"


@pytest.mark.asyncio
async def test_start_syncs_mods_before_launch(manager, tmp_path):
    import backend.main as main
    binary = tmp_path / "PalServer.sh"
    binary.touch()

    mock_proc = MagicMock()
    mock_proc.stdout.readline = AsyncMock(return_value=b"")
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.returncode = 0
    mock_mods = MagicMock()

    with patch("backend.services.server_manager.PALWORLD_BINARY", str(binary)), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
         patch.object(main, "mod_manager", mock_mods):
        await manager.start()

    mock_mods.sync.assert_called_once_with(manager._push_log)
    assert manager.state == ServerState.RUNNING
