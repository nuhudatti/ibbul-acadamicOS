"""
Student ID Validator — IBBUL Official Format (All Years)
Accepts any year cohort (U10, U12, U22, U23, etc.) and flexible segment lengths.
Format: U{YY}/{FACULTY}/{DEPT}/{NUMBER}
Enterprise: used for result uploads, user import, and login across all sessions.
"""
import re
from typing import Optional
from django.core.exceptions import ValidationError

# IBBUL registration pattern: U + year (2 digits) / faculty code (2-4 letters) / dept code (2-4 letters) / number (1-5 digits)
# Examples: U22/FNS/CSC/0001, U10/FNS/CSC/0004, U12/FNS/CSC/001, U23/FES/EEE/1234
STUDENT_ID_PATTERN = re.compile(
    r'^U\d{1,2}/[A-Z]{2,4}/[A-Z]{2,4}/\d{1,5}$',
    re.IGNORECASE
)
# Stricter variant for display (optional): exactly U + 2 digits, 3-letter faculty, 3-letter dept, 4-digit number
CANONICAL_PATTERN = re.compile(r'^U\d{2}/[A-Z]{3}/[A-Z]{3}/\d{4}$')


def department_code_from_student_id(value: str) -> Optional[str]:
    """
    Parse department code from student ID. E.g. U22/FNS/CSC/0001 -> CSC, U12/FNS/CSC/001 -> CSC.
    Returns None if format invalid or not enough segments.
    """
    if not value or not isinstance(value, str):
        return None
    parts = value.strip().upper().split('/')
    if len(parts) >= 3:
        return parts[2]
    return None


def normalize_student_id(value: str) -> str:
    """Strip and uppercase for consistent storage and comparison."""
    if not value or not isinstance(value, str):
        return ''
    return value.strip().upper()


def sanitize_student_id(value: str) -> str:
    """
    Fix common CSV/Excel issues before validation.
    Handles extra spaces, spaces around slashes, backslashes, and space-separated segments.
    """
    if not value or not isinstance(value, str):
        return ''
    s = value.strip()
    if not s:
        return ''
    s = s.replace('\\', '/')
    s = re.sub(r'\s*/\s*', '/', s)
    if '/' not in s:
        parts = [p for p in re.split(r'[\s,;\-]+', s) if p]
        if len(parts) == 4 and parts[0].upper().startswith('U'):
            s = '/'.join(parts)
    else:
        s = re.sub(r'\s+', '', s)
    return s.upper()


def validate_student_id_format(value: str) -> None:
    """
    Validates student ID follows IBBUL format for all years and cohorts.

    Accepted format: U{YY}/{FACULTY}/{DEPT}/{NUMBER}
    - U + 1 or 2 digits: year cohort (U10, U12, U22, U23, etc.)
    - Faculty code: 2–4 letters (e.g. FNS, FES)
    - Department code: 2–4 letters (e.g. CSC, MTH, EEE, GLG)
    - Number: 1–5 digits (e.g. 4, 001, 0001, 12345)

    Examples: U22/FNS/CSC/0001, U10/FNS/CSC/0004, U12/FNS/CSC/001

    Args:
        value: Student ID string to validate

    Raises:
        ValidationError: If format doesn't match expected pattern
    """
    if not value or not isinstance(value, str):
        raise ValidationError(
            'Student ID is required and must be a non-empty string.',
            code='invalid_student_id_format'
        )
    normalized = normalize_student_id(value)
    if not normalized:
        raise ValidationError(
            'Student ID cannot be blank.',
            code='invalid_student_id_format'
        )
    # Allow lowercase input; match after normalizing to uppercase
    if not STUDENT_ID_PATTERN.match(normalized):
        raise ValidationError(
            'Student ID must follow format: U{year}/{faculty}/{dept}/{number} '
            '(e.g. U22/FNS/CSC/0001, U10/FNS/CSC/0004, U12/FNS/CSC/001). '
            'Year: 1–2 digits; faculty/dept: 2–4 letters each; number: 1–5 digits.',
            code='invalid_student_id_format'
        )


def is_valid_student_id_format(value: str) -> bool:
    """Return True if value matches IBBUL student ID format (all years)."""
    if not value or not isinstance(value, str):
        return False
    return bool(STUDENT_ID_PATTERN.match(normalize_student_id(value)))
