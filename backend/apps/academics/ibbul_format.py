"""
IBBUL Official Result Format — single source of truth for manual and bulk upload.
Aligns with the university's official result sheet (Untitled.xls).
Run scripts/inspect_ibbul_result_format.py to regenerate docs from Untitled.xls.

Wide format (official sheet): one row per student; columns = S/N, MATRIC.NO, NAME, then
pairs (course_code, grade) per course. Parser returns one result row per (student, course, score).
"""
import re
from typing import List, Dict, Optional, Any, Tuple

# --- Course table (per-row in bulk / per-line in manual) ---
# Exact column names as in official IBBUL result sheet
IBBUL_COURSE_COLUMNS = [
    "s_n",           # S/N (optional)
    "course_code",   # Course Code
    "course_title",  # Course Title
    "credit_unit",   # Credit Unit
    "score",         # Score (0-100)
    "grade",         # Grade (A-F)
    "grade_point",   # Grade Point
    "remark",        # Remark (Excellent, Very Good, etc.)
]

# Aliases accepted for bulk/CSV (map to canonical name)
# Include exact IBBUL sheet names: MATRIC.NO -> matric_no -> student_id, NAME, course codes as headers
IBBUL_COURSE_COLUMN_ALIASES: Dict[str, str] = {
    "matric_number": "student_id",
    "matric": "student_id",
    "student_id": "student_id",
    "matric_no": "student_id",  # MATRIC.NO normalizes to matric_no
    "reg_number": "student_id",
    "reg_no": "student_id",
    "registration_no": "student_id",
    "name": "student_name",  # optional display only
    "course": "course_code",
    "code": "course_code",
    "title": "course_title",
    "course_name": "course_title",
    "credit_units": "credit_unit",
    "units": "credit_unit",
    "cu": "credit_unit",
    "marks": "score",
    "mark": "score",
    "total": "score",
    "letter_grade": "grade",
    "gp": "grade_point",
    "comment": "remark",
    "level": "level",
    "year": "level",
    "session": "session",
    "academic_session": "session",
    "semester": "semester",
    "sem": "semester",
}

# --- Summary row (LE, NSS, RCU, ...) — same as manual entry ---
IBBUL_SUMMARY_COLUMNS = [
    "le",
    "nss",
    "rcu",
    "ecu",
    "cp",
    "gpa",
    "trcu",
    "tecu",
    "tcp",
    "pcgpa",
    "cgpa",
    "outstanding_courses",
    "remarks",
]

IBBUL_SUMMARY_ALIASES: Dict[str, str] = {
    "level_entry": "le",
    "number_of_subjects": "nss",
    "registered_credit_units": "rcu",
    "earned_credit_units": "ecu",
    "credit_points": "cp",
    "grade_point_average": "gpa",
    "total_registered_credit_units": "trcu",
    "total_earned_credit_units": "tecu",
    "total_credit_points": "tcp",
    "previous_cgpa": "pcgpa",
    "cumulative_gpa": "cgpa",
    "outstanding_courses": "outstanding_courses",
    "outstanding": "outstanding_courses",
    "remarks": "remarks",
    "remark": "remarks",
    "academic_standing": "standing",
}

# --- Required for a valid result row ---
REQUIRED_FOR_RESULT_ROW = ["student_id", "course_code", "score"]
REQUIRED_FOR_SESSION = ["session", "semester"]

# --- Manual entry: one line per course (no course_title — title comes from course catalogue) ---
# Format: Course Code, Credit Unit, Grade, Score (0-100), Remark (optional)
MANUAL_COURSE_LINE_FORMAT = "course_code, credit_unit, grade, score, remark (optional)"
MANUAL_SUMMARY_FORMAT = "LE, NSS, RCU, ECU, CP, GPA, TRCU, TECU, TCP, PCGPA, CGPA, Outstanding courses, Remarks"

# --- Bulk CSV/Excel: header row must include these (or aliases) ---
BULK_REQUIRED_HEADERS = ["matric_number", "course_code", "score"]
BULK_OPTIONAL_HEADERS = [
    "course_title", "credit_unit", "grade", "level", "session", "semester",
    "remark", "le", "nss", "rcu", "ecu", "cp", "gpa", "trcu", "tecu", "tcp", "pcgpa", "cgpa",
    "outstanding_courses", "remarks", "standing",
]


def normalize_column_name(name: str) -> str:
    """Lowercase, strip, replace spaces/dashes/dots with underscore (so MATRIC.NO -> matric_no)."""
    if not name:
        return ""
    s = str(name).strip().lower()
    for c in " .-":
        s = s.replace(c, "_")
    # collapse multiple underscores
    while "__" in s:
        s = s.replace("__", "_")
    return s.strip("_")


def map_to_canonical_columns(row: Dict[str, str]) -> Dict[str, str]:
    """
    Map a raw row (e.g. from CSV/Excel) to canonical IBBUL names.
    Uses IBBUL_COURSE_COLUMN_ALIASES and IBBUL_SUMMARY_ALIASES.
    Preserves numeric score (including 0); strips strings.
    """
    def _str_val(val) -> str:
        if val is None:
            return ""
        if isinstance(val, (int, float)):
            return str(val).strip()
        s = str(val).strip()
        if s.lower() in ("nan", "nat", ""):
            return ""
        return s

    canonical: Dict[str, str] = {}
    for key, value in row.items():
        n = normalize_column_name(key)
        if not n:
            continue
        # Course/student fields
        for alias, canon in IBBUL_COURSE_COLUMN_ALIASES.items():
            if n == alias or n == normalize_column_name(alias):
                canonical[canon] = _str_val(value)
                break
        else:
            # Summary fields
            for alias, canon in IBBUL_SUMMARY_ALIASES.items():
                if n == alias or n == normalize_column_name(alias):
                    canonical[canon] = _str_val(value)
                    break
            else:
                # Keep as-is if it's already a known column
                if n in IBBUL_COURSE_COLUMNS or n in IBBUL_SUMMARY_COLUMNS or n in ["student_id", "session", "semester", "level"]:
                    canonical[n] = _str_val(value)
    return canonical


def get_bulk_expected_headers() -> List[str]:
    """Expected CSV/Excel headers in IBBUL order (required first, then optional)."""
    return BULK_REQUIRED_HEADERS + [h for h in BULK_OPTIONAL_HEADERS if h not in BULK_REQUIRED_HEADERS]
