"""Invalidate cached grading summaries when grades or submissions change."""
from django.core.cache import cache


def invalidate_offering_grade_cache(offering_id: int) -> None:
    cache.delete(f'lms_grading_summary_{offering_id}')


def invalidate_offering_cache_from_assignment(assignment) -> None:
    try:
        offering_id = assignment.lesson.module.offering_id
    except Exception:
        return
    invalidate_offering_grade_cache(offering_id)
