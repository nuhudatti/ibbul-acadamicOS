"""Stage timing for HOD upload validate — logs millisecond breakdown to aid performance tuning."""
from __future__ import annotations

import logging
import time
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


class UploadStageTimer:
    """Record elapsed ms per named stage and emit a formatted timing report."""

    def __init__(self, label: str = 'HOD upload validate') -> None:
        self.label = label
        self._stages: List[Tuple[str, int]] = []
        self._current: Optional[str] = None
        self._stage_start = time.perf_counter()
        self._started = self._stage_start

    def stage(self, name: str) -> None:
        now = time.perf_counter()
        if self._current is not None:
            elapsed_ms = int((now - self._stage_start) * 1000)
            self._stages.append((self._current, elapsed_ms))
        self._current = name
        self._stage_start = now

    def finish(self) -> Tuple[List[Tuple[str, int]], int]:
        now = time.perf_counter()
        if self._current is not None:
            elapsed_ms = int((now - self._stage_start) * 1000)
            self._stages.append((self._current, elapsed_ms))
            self._current = None
        total_ms = int((now - self._started) * 1000)
        self._log_report(total_ms)
        return self._stages, total_ms

    def _log_report(self, total_ms: int) -> None:
        if not self._stages:
            return
        width = max(len(name) for name, _ in self._stages)
        width = max(width, len('Total'))
        lines = [
            f'{name.ljust(width)} .......... {ms:>5} ms'
            for name, ms in self._stages
        ]
        lines.append(f'{"Total".ljust(width)} .......... {total_ms:>5} ms')
        logger.info('%s timing report:\n%s', self.label, '\n'.join(lines))
