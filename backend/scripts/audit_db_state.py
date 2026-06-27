import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from apps.academics.models import Result, Course, ResultUploadBatch
from apps.academics.services import get_course_for_upload

print('=== COURSES (sample) ===')
for code in ['CSC202','CSC204','CSC401','CSC403','CSC 401','GST202','PHY202']:
    c = Course.objects.filter(code__iexact=code.replace(' ','')).first()
    if c:
        print(f'  {c.code!r} dept_id={c.department_id} title={c.title[:40]}')
    else:
        print(f'  {code}: NOT FOUND')

print('\n=== get_course_for_upload dept=5 ===')
for code in ['CSC202','CSC204','CSC401','CSC403','GST202']:
    c = get_course_for_upload(code, department_id=5)
    print(f'  {code}: {c.code if c else "NONE"}')

print('\n=== RESULTS BY BATCH ===')
for b in ResultUploadBatch.objects.order_by('-id')[:3]:
    cnt = Result.objects.filter(upload_batch_id=b.id).count()
    print(f'  batch {b.id} {b.filename} linked_results={cnt} success={b.success_count}')

print('\n=== ALL DB RESULTS (32) ===')
for r in Result.objects.select_related('student','course','upload_batch').order_by('student__student_id','course__code'):
    print(f'  {r.student.student_id} | {r.course.code} | {r.score} {r.grade} | batch={r.upload_batch_id} | {r.status}')
