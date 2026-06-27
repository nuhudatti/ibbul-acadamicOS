from django.contrib import admin
from .models import AcademicSession, StudentCourseRegistration


@admin.register(AcademicSession)
class AcademicSessionAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_current', 'start_date', 'end_date', 'created_at']
    list_filter = ['is_current']
    search_fields = ['name']
    ordering = ['-name']
    actions = ['make_current']

    @admin.action(description='Set selected session as current')
    def make_current(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, 'Please select exactly one session.', level='warning')
            return
        session = queryset.first()
        session.is_current = True
        session.save()
        self.message_user(request, f'"{session.name}" is now the current session.')


@admin.register(StudentCourseRegistration)
class StudentCourseRegistrationAdmin(admin.ModelAdmin):
    list_display = [
        'student', 'course', 'session', 'semester', 'status', 'registered_at'
    ]
    list_filter = ['session', 'semester', 'status']
    search_fields = [
        'student__student_id', 'student__first_name', 'student__last_name',
        'course__code', 'course__title',
    ]
    raw_id_fields = ['student', 'course', 'session']
    ordering = ['-session__name', 'student__student_id']
    list_select_related = ['student', 'course', 'session']
