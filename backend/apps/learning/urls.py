from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LMSOfferingViewSet, EnrollmentViewSet, ModuleViewSet,
    LessonViewSet, QuizViewSet, AssignmentViewSet,
    QuizQuestionViewSet, learning_dashboard_stats,
)
from .engine_views import (
    lesson_live_position, offering_gradebook, export_grade_sheet,
    offering_grading_summary, offering_grading_workspace,
    start_export_grade_sheet, export_grade_sheet_job,
)

router = DefaultRouter()
router.register(r'offerings', LMSOfferingViewSet, basename='lms-offering')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'modules', ModuleViewSet, basename='module')
router.register(r'lessons', LessonViewSet, basename='lesson')
router.register(r'quizzes', QuizViewSet, basename='quiz')
router.register(r'assignments', AssignmentViewSet, basename='assignment')
router.register(r'questions', QuizQuestionViewSet, basename='quiz-question')

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard-stats/', learning_dashboard_stats, name='learning-dashboard-stats'),
    path('lessons/<int:lesson_id>/live-position/', lesson_live_position, name='lesson-live-position'),
    path('offerings/<int:offering_id>/gradebook/', offering_gradebook, name='offering-gradebook'),
    path('offerings/<int:offering_id>/grade-sheet/', export_grade_sheet, name='offering-grade-sheet'),
    path('offerings/<int:offering_id>/grading-summary/', offering_grading_summary, name='offering-grading-summary'),
    path('offerings/<int:offering_id>/grading-workspace/', offering_grading_workspace, name='offering-grading-workspace'),
    path('offerings/<int:offering_id>/grade-sheet/start/', start_export_grade_sheet, name='offering-grade-sheet-start'),
    path('offerings/<int:offering_id>/grade-sheet/job/<str:job_id>/', export_grade_sheet_job, name='offering-grade-sheet-job'),
]
