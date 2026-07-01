"""
Bulk-loaded grade data for an LMS offering.

Loads quiz attempts, submissions, and progress in a small number of queries
instead of per-student/per-lesson loops. Used by gradebook, summary, export,
and grading workspace endpoints.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from django.db.models import Count

from .models import (
    LMSOffering,
    Lesson,
    QuizAttempt,
    Submission,
    Enrollment,
    LessonProgress,
    Module,
)


@dataclass
class OfferingGradeData:
    offering: LMSOffering
    student_ids: List[int]
    quiz_lessons: List[Lesson] = field(default_factory=list)
    assignment_lessons: List[Lesson] = field(default_factory=list)
    modules: List[Module] = field(default_factory=list)
    total_lessons: int = 0
    # (student_id, quiz_id) -> best score %
    best_quiz_scores: Dict[Tuple[int, int], float] = field(default_factory=dict)
    # (student_id, assignment_id) -> submission
    submissions: Dict[Tuple[int, int], Submission] = field(default_factory=dict)
    all_submissions: List[Submission] = field(default_factory=list)
    # student_id -> completed lesson count (offering-wide)
    progress_completed: Dict[int, int] = field(default_factory=dict)
    # (student_id, module_id) -> completed count
    module_progress: Dict[Tuple[int, int], int] = field(default_factory=dict)
    # student_id -> quiz security aggregates
    security_stats: Dict[int, Tuple[int, int, int]] = field(default_factory=dict)

    @classmethod
    def load(cls, offering: LMSOffering, student_ids: Optional[List[int]] = None) -> 'OfferingGradeData':
        if student_ids is None:
            student_ids = list(
                Enrollment.objects.filter(offering=offering, is_active=True)
                .values_list('student_id', flat=True)
            )
        data = cls(offering=offering, student_ids=student_ids)
        data._populate()
        return data

    def _populate(self) -> None:
        offering = self.offering
        sids = self.student_ids

        self.quiz_lessons = list(
            Lesson.objects.filter(
                module__offering=offering, content_type='quiz', is_published=True
            )
            .select_related('quiz', 'module')
            .order_by('module__order', 'order')
        )
        self.assignment_lessons = list(
            Lesson.objects.filter(
                module__offering=offering, content_type='assignment', is_published=True
            )
            .select_related('assignment', 'module')
            .order_by('module__order', 'order')
        )
        self.modules = list(
            Module.objects.filter(offering=offering, is_published=True)
            .prefetch_related('lessons')
            .order_by('order')
        )
        self.total_lessons = Lesson.objects.filter(
            module__offering=offering, is_published=True
        ).count()

        if not sids:
            return

        quiz_ids = [les.quiz_id for les in self.quiz_lessons if hasattr(les, 'quiz') and les.quiz_id]
        if quiz_ids:
            attempts = QuizAttempt.objects.filter(
                quiz_id__in=quiz_ids,
                student_id__in=sids,
                status__in=('submitted', 'timed_out'),
                score__isnull=False,
            ).only('student_id', 'quiz_id', 'score', 'focus_loss_count', 'violation_log')

            best: Dict[Tuple[int, int], float] = {}
            sec: Dict[int, List] = defaultdict(lambda: [0, 0, 0])
            for att in attempts:
                key = (att.student_id, att.quiz_id)
                score = float(att.score)
                if key not in best or score > best[key]:
                    best[key] = score
                sec[att.student_id][0] += att.focus_loss_count or 0
                for ev in att.violation_log or []:
                    et = str(ev.get('type', '')).lower()
                    if 'fullscreen' in et:
                        sec[att.student_id][1] += 1
                    if 'tab' in et or 'blur' in et or 'hidden' in et:
                        sec[att.student_id][2] += 1
            self.best_quiz_scores = best
            self.security_stats = {k: tuple(v) for k, v in sec.items()}

        subs = list(
            Submission.objects.filter(
                assignment__lesson__module__offering=offering,
                student_id__in=sids,
            ).select_related('assignment', 'student', 'graded_by')
        )
        self.all_submissions = subs
        sub_map: Dict[Tuple[int, int], Submission] = {}
        for sub in subs:
            sub_map[(sub.student_id, sub.assignment_id)] = sub
        self.submissions = sub_map

        for row in LessonProgress.objects.filter(
            lesson__module__offering=offering,
            student_id__in=sids,
            completed=True,
        ).values('student_id').annotate(c=Count('id')):
            self.progress_completed[row['student_id']] = row['c']

        module_ids = [m.id for m in self.modules]
        if module_ids:
            for row in LessonProgress.objects.filter(
                lesson__module_id__in=module_ids,
                student_id__in=sids,
                completed=True,
            ).values('student_id', 'lesson__module_id').annotate(c=Count('id')):
                self.module_progress[(row['student_id'], row['lesson__module_id'])] = row['c']

    def quiz_average(self, student_id: int) -> Optional[float]:
        scores = []
        for les in self.quiz_lessons:
            if not hasattr(les, 'quiz') or not les.quiz_id:
                continue
            s = self.best_quiz_scores.get((student_id, les.quiz_id))
            if s is not None:
                scores.append(s)
        if not scores:
            return None
        return round(sum(scores) / len(scores), 2)

    def assignment_average(self, student_id: int) -> Optional[float]:
        scores = []
        for les in self.assignment_lessons:
            if not hasattr(les, 'assignment'):
                continue
            sub = self.submissions.get((student_id, les.assignment_id))
            if sub and sub.score is not None:
                max_s = les.assignment.max_score or 100
                scores.append(round(float(sub.score) / max_s * 100, 2))
        if not scores:
            return None
        return round(sum(scores) / len(scores), 2)

    def progress_for(self, student_id: int) -> Tuple[float, int]:
        completed = self.progress_completed.get(student_id, 0)
        pct = round((completed / self.total_lessons) * 100, 1) if self.total_lessons else 0
        return pct, completed

    def grading_summary_stats(self) -> dict:
        total_students = len(self.student_ids)
        total_slots = total_students * len(self.assignment_lessons)
        submitted_count = len(self.all_submissions)
        missing = max(0, total_slots - submitted_count)

        quiz_avgs = []
        assignment_avgs = []
        for sid in self.student_ids:
            q = self.quiz_average(sid)
            a = self.assignment_average(sid)
            if q is not None:
                quiz_avgs.append(q)
            if a is not None:
                assignment_avgs.append(a)

        similarity_flagged = sum(
            1 for s in self.all_submissions
            if (s.similarity_report or {}).get('flagged')
            or (s.similarity_score and float(s.similarity_score) >= 0.85)
        )
        ai_awaiting = sum(
            1 for s in self.all_submissions
            if getattr(s, 'ai_graded', False) and s.score is None
        )

        return {
            'total_students': total_students,
            'submitted_assignments': submitted_count,
            'missing_assignments': missing,
            'average_quiz_score': round(sum(quiz_avgs) / len(quiz_avgs), 1) if quiz_avgs else None,
            'average_assignment_score': round(sum(assignment_avgs) / len(assignment_avgs), 1) if assignment_avgs else None,
            'similarity_flagged': similarity_flagged,
            'ai_awaiting_approval': ai_awaiting,
        }

    def submissions_by_assignment(self) -> Dict[int, List[Submission]]:
        grouped: Dict[int, List[Submission]] = defaultdict(list)
        for sub in self.all_submissions:
            grouped[sub.assignment_id].append(sub)
        return dict(grouped)

    def module_breakdown(self, student_id: int, compute_final_grade) -> list:
        """Module-level grade breakdown for one student."""
        modules = []
        for mod in self.modules:
            quiz_scores = []
            asg_scores = []
            published_lessons = [l for l in mod.lessons.all() if l.is_published]
            for lesson in published_lessons:
                if lesson.content_type == 'quiz' and hasattr(lesson, 'quiz') and lesson.quiz_id:
                    s = self.best_quiz_scores.get((student_id, lesson.quiz_id))
                    if s is not None:
                        quiz_scores.append(s)
                elif lesson.content_type == 'assignment' and hasattr(lesson, 'assignment'):
                    sub = self.submissions.get((student_id, lesson.assignment_id))
                    if sub and sub.score is not None:
                        max_s = lesson.assignment.max_score or 100
                        asg_scores.append(float(sub.score) / max_s * 100)
            q_avg = round(sum(quiz_scores) / len(quiz_scores), 2) if quiz_scores else None
            a_avg = round(sum(asg_scores) / len(asg_scores), 2) if asg_scores else None
            final, letter = compute_final_grade(q_avg, a_avg)
            completed = self.module_progress.get((student_id, mod.id), 0)
            total = len(published_lessons)
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
