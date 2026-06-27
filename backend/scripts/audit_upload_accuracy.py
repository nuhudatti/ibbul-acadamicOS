"""Compare parsed Excel rows vs database results for accuracy audit."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from decimal import Decimal
from django.db.models import Count
from apps.academics.models import Result, ResultUploadBatch
from apps.academics.services import ResultUploadService


def main():
    print('=== RECENT BATCHES ===')
    batches = list(ResultUploadBatch.objects.order_by('-id')[:5])
    for b in batches:
        print(
            f'  id={b.id} file={b.filename!r} success={b.success_count} '
            f'errors={b.error_count} session={b.session} sem={b.semester} '
            f'path={b.upload_file_path or "(none)"}'
        )

    print('\n=== STATUS COUNTS ===')
    for s in Result.objects.values('status').annotate(c=Count('id')).order_by('status'):
        print(f'  {s["status"]}: {s["c"]}')

    print('\n=== LOCKED_PUBLISHED SAMPLE ===')
    for x in Result.objects.filter(status='LOCKED_PUBLISHED').select_related('student', 'course')[:25]:
        print(
            f'  {x.student.student_id} | {x.course.code} | score={x.score} '
            f'grade={x.grade} | {x.session}/{x.semester}'
        )

    # Try to find and parse source file
    source = None
    for b in batches:
        if b.upload_file_path and os.path.isfile(b.upload_file_path):
            source = b.upload_file_path
            session, semester = b.session, b.semester
            break

    if not source:
        # search common locations
        roots = [
            os.path.join(os.path.dirname(os.path.dirname(__file__)), 'media', 'uploads'),
            os.path.expanduser('~/Documents'),
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        ]
        for root in roots:
            if not os.path.isdir(root):
                continue
            for dirpath, _, files in os.walk(root):
                for fn in files:
                    if fn.lower().endswith(('.xls', '.xlsx')) and 'untitled' in fn.lower():
                        source = os.path.join(dirpath, fn)
                        break
                if source:
                    break
            if source:
                break

    if not source:
        print('\n=== NO SOURCE FILE FOUND for comparison ===')
        return

    session = batches[0].session if batches else '2023/2024'
    semester = batches[0].semester if batches else 'FIRST'
    print(f'\n=== PARSING SOURCE: {source} ===')
    parsed = ResultUploadService._parse_upload_file_rows(source, session, semester)
    print(f'  Parsed rows: {len(parsed)}')

    # Build lookup from parsed file
    file_map = {}
    for row in parsed:
        key = (
            row['student_id'].upper(),
            row['course_code'].upper(),
            row.get('session', session),
            row.get('semester', semester),
        )
        file_map[key] = row

    # Compare with DB (all statuses for same session/semester)
    db_rows = Result.objects.filter(
        session=session, semester=semester
    ).select_related('student', 'course')
    print(f'  DB rows (session={session}, sem={semester}): {db_rows.count()}')

    mismatches = []
    missing_in_db = []
    extra_in_db = []

    for key, row in list(file_map.items())[:500]:
        sid, code, sess, sem = key
        db = db_rows.filter(
            student__student_id=sid, course__code__iexact=code
        ).first()
        if not db:
            missing_in_db.append(key)
            continue
        file_score = round(float(row['score']), 2)
        db_score = round(float(db.score), 2)
        file_grade = (row.get('grade') or '').upper()
        db_grade = (db.grade or '').upper()
        if abs(file_score - db_score) > 0.01 or (file_grade and db_grade and file_grade != db_grade):
            mismatches.append({
                'key': key,
                'file': (file_score, file_grade),
                'db': (db_score, db_grade, db.status),
            })

    db_keys = set()
    for r in db_rows:
        db_keys.add((
            r.student.student_id.upper(),
            r.course.code.upper(),
            r.session,
            r.semester,
        ))
    for key in file_map:
        if key not in db_keys:
            if key not in [m[0] if isinstance(m, tuple) else m['key'] for m in mismatches]:
                pass  # already in missing_in_db

    print(f'\n=== COMPARISON (first 500 parsed rows) ===')
    print(f'  Missing in DB: {len(missing_in_db)}')
    print(f'  Score/grade mismatches: {len(mismatches)}')
    if missing_in_db[:10]:
        print('  Sample missing:')
        for k in missing_in_db[:10]:
            print(f'    {k}')
    if mismatches[:15]:
        print('  Sample mismatches (file vs db):')
        for m in mismatches[:15]:
            print(f'    {m["key"]}: file={m["file"]} db={m["db"]}')

    # Show one student full comparison
    if parsed:
        sample_sid = parsed[0]['student_id'].upper()
        print(f'\n=== STUDENT {sample_sid} — FILE vs DB ===')
        file_courses = sorted(
            [(r['course_code'], r['score'], r.get('grade', '')) for r in parsed if r['student_id'].upper() == sample_sid],
            key=lambda x: x[0],
        )
        db_courses = sorted(
            [(r.course.code, r.score, r.grade, r.status) for r in db_rows if r.student.student_id.upper() == sample_sid],
            key=lambda x: x[0],
        )
        print(f'  File courses ({len(file_courses)}):')
        for c in file_courses[:20]:
            print(f'    {c[0]}: {c[1]} {c[2]}')
        print(f'  DB courses ({len(db_courses)}):')
        for c in db_courses[:20]:
            print(f'    {c[0]}: {c[1]} {c[2]} [{c[3]}]')


if __name__ == '__main__':
    main()
