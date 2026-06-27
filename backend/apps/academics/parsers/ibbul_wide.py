"""
Parse IBBUL official result sheets (two layouts supported).
1. Wide format (legacy): S/N, MATRIC.NO, NAME, then (course_code, grade) pairs every 2 columns.
2. University format: S/N, MATRIC.NO, NAME, then one column per course (CSC 401, MTH 309, ...), then RCU, ECU, CP, GPA, etc.
   Cell format: "63 B" (score + space + grade), or "B", or "63", or empty.
Returns one result dict per (student, course, score, grade) — exactly what is in the file.
"""
import re
from typing import List, Dict, Any, Optional, Tuple

from ..ibbul_format import normalize_column_name


STUDENT_ID_PATTERN = re.compile(r'^U\d{1,2}/[A-Za-z]{2,4}/[A-Za-z]{2,4}/\d{1,5}$', re.IGNORECASE)

SESSION_IN_HEADER = re.compile(
    r'(\d{4}/\d{4})\s+SESSION',
    re.IGNORECASE,
)


def detect_session_semester_from_sheet(raw_rows: List[List[Any]]) -> Tuple[Optional[str], Optional[str]]:
    """
    Read session/semester printed on the official sheet header
    (e.g. '2013/2014 SESSION  SECOND SEMESTER EXAMINATION RESULTS').
    """
    session = None
    semester = None
    for row in raw_rows[:12]:
        if not row:
            continue
        text = ' '.join(_cell_str(c) for c in row if _cell_str(c))
        if not text:
            continue
        upper = text.upper()
        m = SESSION_IN_HEADER.search(text)
        if m:
            session = m.group(1)
        if 'SECOND SEMESTER' in upper or '2ND SEMESTER' in upper:
            semester = 'SECOND'
        elif 'FIRST SEMESTER' in upper or '1ST SEMESTER' in upper:
            semester = 'FIRST'
        if session and semester:
            break
    return session, semester

# Summary column headers (not course codes) — skip when detecting course columns
SUMMARY_HEADERS = frozenset({
    'rcu', 'ecu', 'cp', 'gpa', 'trcu', 'tecu', 'tcp', 'cgpa', 'pcgpa',
    'outstanding_courses', 'outstanding', 'remarks', 'remark', 'le', 'nss', 'standing',
    'status', 'final_status', 'finalstatus',
})


def _cell_str(val: Any) -> str:
    if val is None:
        return ''
    s = str(val).strip()
    if s.lower() in ('nan', 'nat', 'none', ''):
        return ''
    return s


def _normalize_course_code(raw: str) -> str:
    """CSC202, PHY 202 -> CSC202, PHY202."""
    s = raw.replace(' ', '').upper()
    return s if s else raw.strip().upper()


def _is_student_id(val: str) -> bool:
    normalized = _cell_str(val).strip().upper()
    if not normalized:
        return False
    return bool(STUDENT_ID_PATTERN.match(normalized))


def _is_course_code(val: str) -> bool:
    s = _cell_str(val)
    if not s or len(s) < 4:
        return False
    normalized = _normalize_course_code(s)
    return bool(re.match(r'^[A-Z]+\d{2,4}$', normalized))


def _parse_score(val: Any) -> Optional[float]:
    s = _cell_str(val)
    if not s:
        return None
    try:
        f = float(s)
        if 0 <= f <= 100:
            return f
    except (TypeError, ValueError):
        pass
    return None


# Midpoint score when only letter grade is present (e.g. cell "B" only)
GRADE_TO_SCORE = {'A': 85, 'B': 65, 'C': 55, 'D': 47, 'E': 42, 'F': 20}


def _parse_course_cell(cell_val: Any) -> Tuple[Optional[float], str]:
    """
    Parse university-format cell: "63 B", "B", "63", or empty.
    Returns (score, grade). Grade A-F; score 0-100 or derived from grade.
    """
    s = _cell_str(cell_val)
    if not s:
        return None, ''
    s = s.strip().upper()
    parts = s.split()
    score = None
    grade = ''
    for p in parts:
        if p in ('A', 'B', 'C', 'D', 'E', 'F'):
            grade = p
            if score is None:
                score = float(GRADE_TO_SCORE.get(p, 0))
        else:
            try:
                f = float(p)
                if 0 <= f <= 100:
                    score = round(f, 2)  # exact 2 dp to match DB and avoid float noise
                    if not grade:
                        grade = _score_to_grade(score)
            except (TypeError, ValueError):
                pass
    if score is None and grade:
        score = round(float(GRADE_TO_SCORE.get(grade, 0)), 2)
    if score is not None:
        return round(score, 2), grade or _score_to_grade(score)
    return None, ''


def _score_to_grade(score: float) -> str:
    if score >= 70:
        return 'A'
    if score >= 60:
        return 'B'
    if score >= 50:
        return 'C'
    if score >= 45:
        return 'D'
    if score >= 40:
        return 'E'
    return 'F'


def parse_ibbul_university_excel(
    raw_rows: List[List[Any]],
    session: str,
    semester: str,
    matric_aliases: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parse university format: one row per student; columns = S/N, MATRIC.NO, NAME,
    then one column per course (CSC101, MTH101, ..., CSC414, etc.), then RCU, ECU, CP, GPA, TRCU, TECU, TCP, CGPA, etc.
    Course cell = "63 B", "B", "63", or just a number (e.g. 46).
    Returns (results, summaries): results = one dict per (student, course, score, grade);
    summaries = one dict per student row with exact file values for rcu, ecu, cp, gpa, trcu, tecu, tcp, cgpa, standing (no calculation).
    """
    if not raw_rows:
        return [], []
    aliases = matric_aliases or ['matric_no', 'matric.no', 'matric_number', 'student_id', 'reg_no', 'reg_number']
    alias_set = {normalize_column_name(a) for a in aliases}

    # Full width of sheet
    first_chunk = raw_rows[:100] if raw_rows else []
    max_cols_overall = min(300, max(len(r) for r in first_chunk) if first_chunk else 0)

    # Step 1: Find first row with MATRIC.NO to get matric column index
    matric_row_idx = -1
    matric_col = -1
    for i in range(min(40, len(raw_rows))):
        row = raw_rows[i]
        if not row:
            continue
        for c, cell in enumerate(row):
            norm = normalize_column_name(_cell_str(cell))
            if norm in alias_set:
                matric_row_idx = i
                matric_col = c
                break
        if matric_col >= 0:
            break
    if matric_row_idx < 0 or matric_col < 0:
        return []

    # Step 2: Find the row (same or different) that has the MOST course columns — so we get every course
    best_course_row_idx = -1
    best_course_columns: List[Tuple[int, str]] = []
    for i in range(min(40, len(raw_rows))):
        row = raw_rows[i]
        if not row:
            continue
        course_columns = []
        for c in range(matric_col + 2, max_cols_overall):
            cell = row[c] if c < len(row) else ''
            raw_code = _cell_str(cell)
            if not raw_code:
                continue
            norm = normalize_column_name(raw_code)
            if norm in SUMMARY_HEADERS:
                continue
            code_norm = _normalize_course_code(raw_code)
            if code_norm and re.match(r'^[A-Z]+\d{2,4}$', code_norm):
                course_columns.append((c, code_norm))
        if len(course_columns) > len(best_course_columns):
            best_course_columns = course_columns
            best_course_row_idx = i

    if not best_course_columns:
        return [], []

    header_row = raw_rows[best_course_row_idx]
    # Summary column indices: exact file headers RCU, ECU, CP, GPA, TRCU, TECU, TCP, CGPA, OUTSTANDING COURSES, REMARKS, etc.
    summary_col_map: Dict[str, int] = {}  # our field name -> col index
    for c in range(len(header_row)):
        cell = header_row[c] if c < len(header_row) else ''
        norm = normalize_column_name(_cell_str(cell))
        if not norm:
            continue
        if norm in ('rcu', 'ecu', 'cp', 'gpa', 'trcu', 'tecu', 'tcp', 'pcgpa', 'cgpa', 'le', 'nss'):
            summary_col_map[norm] = c
        elif norm in ('outstanding_courses', 'outstanding'):
            if 'outstanding_courses' not in summary_col_map:
                summary_col_map['outstanding_courses'] = c
        elif norm in ('remarks', 'remark'):
            if 'remarks' not in summary_col_map:
                summary_col_map['remarks'] = c
        elif norm in ('standing', 'status', 'final_status', 'finalstatus'):
            if 'standing' not in summary_col_map:
                summary_col_map['standing'] = c

    course_columns = best_course_columns
    # Data starts after the last header row (matric row and/or course header row)
    data_start = max(matric_row_idx, best_course_row_idx) + 1
    # Skip "units" row if present (row of 1-6 values under course codes)
    if data_start < len(raw_rows):
        units_row = raw_rows[data_start]
        if units_row and len(units_row) > matric_col + 2:
            try:
                vals = [units_row[c] for c in range(matric_col + 2, min(matric_col + 15, len(units_row)))]
                numeric = sum(1 for v in vals if _parse_score(v) is not None)
                in_range = sum(1 for v in vals if _parse_score(v) is not None and 1 <= (_parse_score(v) or 0) <= 6)
                if numeric >= 3 and in_range == numeric:
                    data_start += 1
            except Exception:
                pass
    sem_upper = str(semester).upper()
    sem_val = 'FIRST' if ('1' in sem_upper or 'FIRST' in sem_upper) else 'SECOND'
    stop_keywords = ('HOD', 'DEAN', 'DR.', 'PROF', 'SIGNATURE', 'B.Sc.', 'SESSION', 'EXAMINATION')

    results: List[Dict[str, Any]] = []
    summaries: List[Dict[str, Any]] = []
    for r in range(data_start, len(raw_rows)):
        row = raw_rows[r]
        if len(row) <= matric_col:
            continue
        student_id_raw = _cell_str(row[matric_col])
        if not student_id_raw:
            continue
        if not _is_student_id(student_id_raw):
            if any(k in student_id_raw.upper() for k in stop_keywords):
                break
            if normalize_column_name(student_id_raw) in alias_set:
                continue
            continue
        student_id = student_id_raw.strip().upper()
        for col_idx, course_code in course_columns:
            if col_idx >= len(row):
                continue
            score, grade = _parse_course_cell(row[col_idx])
            if score is None:
                continue
            results.append({
                'student_id': student_id,
                'course_code': course_code,
                'score': score,
                'grade': grade,
                'session': session,
                'semester': sem_val,
            })
        # Extract summary from this row exactly as in file (no calculation)
        summary_row: Dict[str, Any] = {
            'student_id': student_id,
            'session': session,
            'semester': sem_val,
            'rcu': '', 'ecu': '', 'cp': '', 'gpa': '', 'trcu': '', 'tecu': '', 'tcp': '', 'pcgpa': '', 'cgpa': '', 'le': '', 'nss': '',
            'outstanding_courses': '', 'remarks': '', 'standing': '',
        }
        for field, col in summary_col_map.items():
            if col < len(row):
                summary_row[field] = _cell_str(row[col])
        summaries.append(summary_row)
    return results, summaries


def parse_ibbul_wide_excel(
    raw_rows: List[List[Any]],
    session: str,
    semester: str,
    matric_aliases: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Parse IBBUL official wide-format sheet. Header row has S/N, MATRIC.NO, NAME, then
    course codes every 2 columns (CSC202, "", CSC204, ""...). Data rows: score in same column as course code.
    Returns one dict per (student, course, score) — exactly what is in the file.
    """
    if not raw_rows:
        return []
    aliases = matric_aliases or ['matric_no', 'matric.no', 'matric_number', 'student_id', 'reg_no', 'reg_number']
    alias_set = {normalize_column_name(a) for a in aliases}

    header_row_idx = -1
    matric_col = -1
    course_columns: List[Tuple[int, str]] = []

    for i in range(min(25, len(raw_rows))):
        row = raw_rows[i]
        if not row:
            continue
        matric_col = -1
        for c, cell in enumerate(row):
            norm = normalize_column_name(_cell_str(cell))
            if norm in alias_set:
                matric_col = c
                break
        if matric_col < 0:
            continue
        start_col = max(3, matric_col + 2)
        course_columns = []
        for c in range(start_col, len(row), 2):
            cell = row[c] if c < len(row) else ''
            code = _cell_str(cell)
            if code and _is_course_code(code):
                course_columns.append((c, _normalize_course_code(code)))
        if course_columns:
            header_row_idx = i
            break

    if header_row_idx < 0 or matric_col < 0 or not course_columns:
        return []

    data_start = header_row_idx + 2
    sem_upper = str(semester).upper()
    sem_val = 'FIRST' if ('1' in sem_upper or 'FIRST' in sem_upper) else 'SECOND'

    results: List[Dict[str, Any]] = []
    for r in range(data_start, len(raw_rows)):
        row = raw_rows[r]
        if len(row) <= matric_col:
            continue
        student_id_raw = _cell_str(row[matric_col])
        if not student_id_raw:
            continue
        if not _is_student_id(student_id_raw):
            if any(x in student_id_raw.upper() for x in ('HOD', 'DEAN', 'DR.', 'PROF', 'SIGNATURE', 'B.Sc.', 'SESSION')):
                break
            if normalize_column_name(student_id_raw) in alias_set:
                continue
            continue
        student_id = student_id_raw.strip().upper()
        for col_idx, course_code in course_columns:
            if col_idx >= len(row):
                continue
            score = _parse_score(row[col_idx])
            if score is None:
                continue
            grade = ''
            if col_idx + 1 < len(row):
                grade = _cell_str(row[col_idx + 1])
            results.append({
                'student_id': student_id,
                'course_code': course_code,
                'score': score,
                'grade': grade,
                'session': session,
                'semester': sem_val,
            })
    return results
