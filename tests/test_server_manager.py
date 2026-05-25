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
    binary = tmp_path / "PalServer.sh"
    binary.touch()

    mock_proc = MagicMock()
    mock_proc.stdout.readline = AsyncMock(return_value=b"")
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.returncode = 0

    with patch("backend.services.server_manager.PALWORLD_BINARY", str(binary)), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        await manager.start()

    assert manager.state == ServerState.RUNNING


@pytest.mark.asyncio
async def test_stop_terminates_process_and_sets_stopped(manager):
    mock_proc = MagicMock()
    mock_proc.terminate = MagicMock()
    mock_proc.wait = AsyncMock(return_value=0)
    manager.state = ServerState.RUNNING
    manager._process = mock_proc

    await manager.stop()

    assert manager.state == ServerState.STOPPED
    mock_proc.terminate.assert_called_once()


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
