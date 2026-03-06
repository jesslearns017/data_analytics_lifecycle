"""In-memory async task manager using threading."""

from __future__ import annotations

import threading
import traceback
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Task:
    id: str
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: str | None = None
    progress: str = ""


_tasks: dict[str, Task] = {}
_lock = threading.Lock()


def submit_task(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> str:
    """Submit a function to run in a background thread. Returns a task_id."""
    task_id = uuid.uuid4().hex[:12]
    task = Task(id=task_id, status=TaskStatus.RUNNING)

    with _lock:
        _tasks[task_id] = task

    def _run():
        try:
            result = fn(*args, **kwargs)
            with _lock:
                task.status = TaskStatus.COMPLETED
                task.result = result
        except Exception as e:
            with _lock:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                traceback.print_exc()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return task_id


def get_task(task_id: str) -> Task | None:
    """Get a task by ID."""
    with _lock:
        return _tasks.get(task_id)


def cleanup_task(task_id: str) -> None:
    """Remove a completed/failed task from memory."""
    with _lock:
        _tasks.pop(task_id, None)
