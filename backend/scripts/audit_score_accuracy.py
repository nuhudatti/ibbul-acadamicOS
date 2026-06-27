import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from apps.academics.services import ResultUploadService

UNTITLED = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'media', 'upload_batches', '79_Untitled.xls'
)
SESSION, SEM = '2023/2024', 'FIRST'

parsed, summaries = ResultUploadService._parse_upload_file_rows_with_summaries(
    UNTITLED, SESSION, SEM
)
print(f'Rows: {len(parsed)}, Summaries: {len(summaries)}')

sid = 'U12/FNS/CSC/001'
student_rows = [r for r in parsed if r['student_id'].upper() == sid]
print(f'\n{sid} — {len(student_rows)} courses from file:')
for r in sorted(student_rows, key=lambda x: x['course_code']):
    print(f"  {r['course_code']}: score={r['score']} grade={r.get('grade','')}")

summary = next((s for s in summaries if s['student_id'].upper() == sid), None)
if summary:
    print(f'\nSummary from file: GPA={summary.get("gpa")} CGPA={summary.get("cgpa")} RCU={summary.get("rcu")} ECU={summary.get("ecu")} standing={summary.get("standing")}')

report = ResultUploadService.validate_parsed_rows(parsed, SESSION, SEM, department_id=5)
print(f'\nValidation: {sum(1 for r in report if r["valid"])} valid / {len(report)} total')
