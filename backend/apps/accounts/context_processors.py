"""
Context processors so lecturer (examiner) flags are in every template.
Ensures is_examiner and show_lecturer_ui are set for admin Result/Course pages.
"""


def lecturer_context(request):
    """Add is_examiner and show_lecturer_ui when user is Examiner (Lecturer)."""
    if not getattr(request, 'user', None) or not getattr(request.user, 'is_authenticated', False):
        return {}
    role = getattr(request.user, 'role', None)
    if role is None:
        return {}
    if str(role).upper() == 'EXAMINER':
        return {'is_examiner': True, 'show_lecturer_ui': True}
    return {}
