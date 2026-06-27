"""
Learning Engine API — live sync, gradebook (Learning app only).
"""
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import UserRole
from .models import (
    LMSOffering, Lesson, QuizAttempt, Submission, Enrollment, LessonProgress,
)

QUIZ_WEIGHT = 40
ASSIGNMENT_WEIGHT = 60

GRADE_BANDS = [
    (70, 'A'),
    (60, 'B'),
    (50, 'C'),
    (45, 'D'),
    (0, 'F'),
]


def letter_grade(score: float) -> str:
    for threshold, letter in GRADE_BANDS:
        if score >= threshold:
            return letter
    return 'F'


def _student_quiz_average(student, offering):
    scores = []
    for lesson in Lesson.objects.filter(
        module__offering=offering, content_type='quiz', is_published=True
    ).select_related('quiz'):
        if not hasattr(lesson, 'quiz'):
            continue
        attempt = (
            QuizAttempt.objects.filter(
                quiz=lesson.quiz, student=student, status='submitted', score__isnull=False
            )
            .order_by('-score')
            .first()
        )
        if attempt:
            scores.append(float(attempt.score))
    if not scores:
        return None
    return round(sum(scores) / len(scores), 2)


def _student_assignment_average(student, offering):
    scores = []
    for lesson in Lesson.objects.filter(
        module__offering=offering, content_type='assignment', is_published=True
    ).select_related('assignment'):
        if not hasattr(lesson, 'assignment'):
            continue
        sub = Submission.objects.filter(
            assignment=lesson.assignment, student=student, score__isnull=False
        ).first()
        if sub:
            max_s = lesson.assignment.max_score or 100
            scores.append(round(float(sub.score) / max_s * 100, 2))
    if not scores:
        return None
    return round(sum(scores) / len(scores), 2)


def compute_final_grade(quiz_avg, assignment_avg):
    """Weighted final with dynamic re-normalization when one component is missing."""
    components = []
    if quiz_avg is not None:
        components.append((quiz_avg, QUIZ_WEIGHT))
    if assignment_avg is not None:
        components.append((assignment_avg, ASSIGNMENT_WEIGHT))
    if not components:
        return None, None
    total_weight = sum(w for _, w in components)
    final = sum(s * w for s, w in components) / total_weight
    final = round(final, 2)
    return final, letter_grade(final)


def _module_breakdown(student, offering):
    modules = []
    for mod in offering.modules.filter(is_published=True).order_by('order'):
        quiz_scores = []
        asg_scores = []
        for lesson in mod.lessons.filter(is_published=True):
            if lesson.content_type == 'quiz' and hasattr(lesson, 'quiz'):
                att = QuizAttempt.objects.filter(
                    quiz=lesson.quiz, student=student, status='submitted', score__isnull=False
                ).order_by('-score').first()
                if att:
                    quiz_scores.append(float(att.score))
            elif lesson.content_type == 'assignment' and hasattr(lesson, 'assignment'):
                sub = Submission.objects.filter(
                    assignment=lesson.assignment, student=student, score__isnull=False
                ).first()
                if sub:
                    max_s = lesson.assignment.max_score or 100
                    asg_scores.append(float(sub.score) / max_s * 100)
        q_avg = round(sum(quiz_scores) / len(quiz_scores), 2) if quiz_scores else None
        a_avg = round(sum(asg_scores) / len(asg_scores), 2) if asg_scores else None
        final, letter = compute_final_grade(q_avg, a_avg)
        completed = LessonProgress.objects.filter(
            lesson__module=mod, student=student, completed=True
        ).count()
        total = mod.lessons.filter(is_published=True).count()
        modules.append({
            'module_id': mod.id,
            'module_title': mod.title,
            'quiz_average': q_avg,
            'assignment_average': a_avg,
            'final_score': final,
            'letter_grade': letter,
            'steps_completed': completed,
            'steps_total': total,
        })
    return modules


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def lesson_live_position(request, lesson_id):
    """
    Live lecturer position for reading/PDF sync.
    POST: instructor sets scroll_percent (0-100), page (optional)
    GET: students poll current position
    """
    cache_key = f'lms_live_lesson_{lesson_id}'
    try:
        lesson = Lesson.objects.select_related('module__offering').get(pk=lesson_id)
    except Lesson.DoesNotExist:
        return Response({'detail': 'Lesson not found.'}, status=status.HTTP_404_NOT_FOUND)

    user = request.user

    if request.method == 'POST':
        if user.role != UserRole.EXAMINER:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if lesson.module.offering.instructor_id != user.id:
            return Response({'detail': 'Not your offering.'}, status=status.HTTP_403_FORBIDDEN)
        scroll = float(request.data.get('scroll_percent', 0))
        scroll = max(0, min(100, scroll))
        page = int(request.data.get('page', 1))
        payload = {
            'scroll_percent': scroll,
            'page': page,
            'instructor_name': user.get_full_name() or user.email,
            'active': request.data.get('active', True),
        }
        cache.set(cache_key, payload, timeout=7200)
        return Response(payload)

    data = cache.get(cache_key) or {'scroll_percent': 0, 'page': 1, 'active': False}
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def offering_gradebook(request, offering_id):
    """
    Grade breakdown for an offering.
    Students: own grades only. Instructors: all enrolled students.
    """
    try:
        offering = LMSOffering.objects.select_related('instructor').get(pk=offering_id)
    except LMSOffering.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    user = request.user
    is_instructor = user.role == UserRole.EXAMINER and offering.instructor_id == user.id
    is_staff = user.role in (
        UserRole.DEPARTMENT_ADMIN, UserRole.HOD, UserRole.FACULTY_ADMIN, UserRole.SUPER_ADMIN
    )

    if user.role == UserRole.STUDENT:
        students = [user]
    elif is_instructor or is_staff:
        students = [
            e.student for e in Enrollment.objects.filter(
                offering=offering, is_active=True
            ).select_related('student')
        ]
    else:
        return Response(status=status.HTTP_403_FORBIDDEN)

    rows = []
    for st in students:
        q_avg = _student_quiz_average(st, offering)
        a_avg = _student_assignment_average(st, offering)
        final, letter = compute_final_grade(q_avg, a_avg)
        rows.append({
            'student_id': st.student_id or str(st.id),
            'full_name': st.get_full_name(),
            'quiz_average': q_avg,
            'assignment_average': a_avg,
            'quiz_weight': QUIZ_WEIGHT,
            'assignment_weight': ASSIGNMENT_WEIGHT,
            'final_score': final,
            'letter_grade': letter,
            'modules': _module_breakdown(st, offering),
        })

    return Response({
        'offering_id': offering.id,
        'course_code': offering.course.code,
        'weights': {'quiz': QUIZ_WEIGHT, 'assignment': ASSIGNMENT_WEIGHT},
        'grade_bands': [{'min': t, 'grade': g} for t, g in GRADE_BANDS],
        'students': rows if (is_instructor or is_staff) else rows[:1],
    })
