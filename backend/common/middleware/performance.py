"""
Optional request timing middleware — enable with PERF_LOG_SLOW=1.
Logs endpoints exceeding PERF_SLOW_MS (default 500ms) with SQL query count when DEBUG.
"""
import logging
import os
import time

from django.db import connection, reset_queries

logger = logging.getLogger('ibbul.performance')

ENABLED = os.getenv('PERF_LOG_SLOW', '').strip() in ('1', 'true', 'yes')
SLOW_MS = int(os.getenv('PERF_SLOW_MS', '500'))


class SlowRequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not ENABLED:
            return self.get_response(request)

        reset_queries()
        start = time.perf_counter()
        response = self.get_response(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        if elapsed_ms >= SLOW_MS:
            query_count = len(connection.queries)
            logger.warning(
                'SLOW %s %s %.0fms queries=%d status=%s',
                request.method,
                request.path,
                elapsed_ms,
                query_count,
                getattr(response, 'status_code', '?'),
            )
        return response
