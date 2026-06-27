"""Deep audit: why file rows don't match DB."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from collections import Counter
from apps.academics.models import Result, Department
from apps.academics.services import ResultUploadService, get_course_for_upload
from apps.accounts.models import User, UserRole

UNTITLED = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'media', 'upload_batches', '79_Untitled.xls'
)
SESSION, SEM = '2023/2024', 'FIRST'
DEPT_ID = 5  # CSC HOD department

parsed = ResultUploadService._parse_upload_file_rows(UNTITLED, SESSION, SEM)
print(f'Parsed from Untitled.xls: {len(parsed)} rows')
print(f'Unique students in file: {len({r["student_id"] for r in parsed})}')
print(f'Unique courses in file: {len({r["course_code"] for r in parsed})}')

report = ResultUploadService.validate_parsed_rows(parsed, SESSION, SEM, department_id=DEPT_ID)
valid = [r for r in report if r['valid']]
invalid = [r for r in report if not r['valid']]
print(f'\nValidation (dept_id={DEPT_ID}): valid={len(valid)} invalid={len(invalid)}')

err_types = Counter()
for r in invalid:
    for e in r['errors']:
        err_types[e.split('.')[0].split('(')[0].strip()[:60]] += 1
print('\nTop validation errors:')
for msg, cnt in err_types.most_common(15):
    print(f'  {cnt:4d}  {msg}')

# Check student existence
file_students = {r['student_id'].upper() for r in parsed}
db_students = set(
    User.objects.filter(role=UserRole.STUDENT, student_id__in=file_students)
    .values_list('student_id', flat=True)
)
print(f'\nStudents in file: {len(file_students)}')
print(f'Students registered in DB: {len(db_students)}')
print(f'Missing students: {len(file_students - db_students)}')
if file_students - db_students:
    print('  Sample missing:', sorted(file_students - db_students)[:8])

file_courses = {r['course_code'].upper() for r in parsed}
missing_courses = []
for code in sorted(file_courses):
    if not get_course_for_upload(code, department_id=DEPT_ID):
        missing_courses.append(code)
print(f'\nCourses in file: {len(file_courses)}')
print(f'Courses NOT in HOD dept catalogue: {len(missing_courses)}')
if missing_courses:
    print('  Sample:', missing_courses[:15])

# Compare one student that HAS db results
for sid in ['U10/FAN/CSC/019', 'U10/FAN/CSC/018']:
    file_rows = {(r['course_code'], float(r['score']), r.get('grade','')) for r in parsed if r['student_id'].upper()==sid}
    db_rows = Result.objects.filter(student__student_id=sid, session=SESSION, semester=SEM).select_related('course')
    print(f'\n=== {sid} ===')
    print(f'  File: {len(file_rows)} courses | DB: {db_rows.count()} results')
    for r in sorted(file_rows, key=lambda x: x[0])[:12]:
        code = r[0].replace(' ','').upper()
        db = db_rows.filter(course__code__iexact=code).first() or db_rows.filter(course__code__iexact=r[0]).first()
        if db:
            match = abs(float(db.score)-r[1])<0.01 and (not r[2] or db.grade==r[2])
            flag = 'OK' if match else f'MISMATCH db={db.score}/{db.grade}'
        else:
            flag = 'MISSING'
        print(f'    {r[0]}: {r[1]} {r[2]} -> {flag}')
