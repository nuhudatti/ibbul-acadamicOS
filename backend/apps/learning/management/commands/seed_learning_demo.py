"""
Seed sample LMS offerings, modules, lessons, and enrollments for demo.
Run: python manage.py seed_learning_demo
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User, UserRole
from apps.academics.models import Course, CourseAssignment
from apps.core.models import AcademicSession
from apps.learning.models import (
    LMSOffering, Module, Lesson, Quiz, QuizQuestion, Enrollment,
)


class Command(BaseCommand):
    help = 'Seed demo Virtual Learning offerings for lecturers and students'

    def handle(self, *args, **options):
        session = AcademicSession.get_current()
        session_name = session.name if session else '2024/2025'

        lecturer = User.objects.filter(email='lecturer1@ibbul.edu.ng', role=UserRole.EXAMINER).first()
        if not lecturer:
            self.stdout.write(self.style.WARNING('lecturer1@ibbul.edu.ng not found — run seed_demo first'))
            return

        assignments = CourseAssignment.objects.filter(examiner=lecturer).select_related('course')[:2]
        if not assignments.exists():
            self.stdout.write(self.style.WARNING('No course assignments for lecturer1 — run seed_demo first'))
            return

        created_offerings = 0
        for ca in assignments:
            course = ca.course
            offering, created = LMSOffering.objects.get_or_create(
                course=course,
                session=session_name,
                semester=course.semester,
                defaults={
                    'instructor': lecturer,
                    'description': f'Virtual learning for {course.title}. Interactive lessons, quizzes, and assignments.',
                    'is_published': True,
                    'enrollment_open': True,
                },
            )
            if not created:
                offering.instructor = lecturer
                offering.is_published = True
                offering.enrollment_open = True
                offering.save()
            else:
                created_offerings += 1

            if not offering.modules.exists():
                mod1 = Module.objects.create(
                    offering=offering,
                    title='Week 1 — Introduction',
                    description='Foundation concepts and orientation',
                    order=0,
                )
                les1 = Lesson.objects.create(
                    module=mod1,
                    title=f'Welcome to {course.code}',
                    content_type='html',
                    content_body=f'<h2>Welcome</h2><p>This is your virtual classroom for <strong>{course.title}</strong>.</p><p>Work through each lesson in order. Complete quizzes to unlock progress.</p>',
                    order=0,
                    is_published=True,
                )
                les2 = Lesson.objects.create(
                    module=mod1,
                    title='Overview video',
                    content_type='link',
                    external_url='https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    order=1,
                    is_published=True,
                )
                quiz_lesson = Lesson.objects.create(
                    module=mod1,
                    title='Week 1 Knowledge Check',
                    content_type='quiz',
                    order=2,
                    is_published=True,
                )
                quiz = Quiz.objects.create(
                    lesson=quiz_lesson,
                    title=f'{course.code} Week 1 Quiz',
                    instructions='Answer all questions. Pass mark is 50%.',
                    passing_score=50,
                    max_attempts=3,
                    time_limit_minutes=15,
                )
                QuizQuestion.objects.create(
                    quiz=quiz,
                    question_text='Virtual Learning is part of the IBBUL Academic OS.',
                    options=['True', 'False'],
                    correct_index=0,
                    points=1,
                    order=0,
                )
                QuizQuestion.objects.create(
                    quiz=quiz,
                    question_text='You should complete lessons in sequential order.',
                    options=['True', 'False'],
                    correct_index=0,
                    points=1,
                    order=1,
                )

                mod2 = Module.objects.create(
                    offering=offering,
                    title='Week 2 — Core Topics',
                    description='Deeper study and practice',
                    order=1,
                )
                Lesson.objects.create(
                    module=mod2,
                    title='Reading material',
                    content_type='html',
                    content_body='<p>Study the core topics for this week. Take notes and prepare for the assignment.</p>',
                    order=0,
                    is_published=True,
                )

        # Enroll first 5 students in first offering
        first_offering = LMSOffering.objects.filter(instructor=lecturer, is_published=True).first()
        if first_offering:
            students = User.objects.filter(role=UserRole.STUDENT, is_active=True)[:5]
            for st in students:
                Enrollment.objects.get_or_create(
                    offering=first_offering,
                    student=st,
                    defaults={'is_active': True},
                )

        total = LMSOffering.objects.filter(instructor=lecturer).count()
        self.stdout.write(self.style.SUCCESS(
            f'Done. {created_offerings} new offering(s). Lecturer1 now has {total} LMS offering(s).'
        ))
        self.stdout.write('  Login: lecturer1@ibbul.edu.ng -> Learning -> My Offerings')
        self.stdout.write('  Students: browse Learning -> Course Catalog to enroll')
