"""
Custom JWT token serializer.
Embeds role, module_access, full_name, and academic context into the JWT payload
so the frontend can make routing decisions without an extra profile API call.
"""
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Identity
        token['role'] = str(user.role) if user.role else ''
        token['full_name'] = user.get_full_name()
        token['email'] = user.email or ''
        token['is_first_login'] = user.is_first_login

        # Module access — drives dashboard routing
        token['module_access'] = user.module_access or []

        # Student identity
        if user.student_id:
            token['student_id'] = user.student_id

        # Academic scope context
        token['department'] = user.department or ''
        token['level'] = user.level or ''

        if user.faculty_id:
            token['faculty_id'] = user.faculty_id
            token['faculty_name'] = user.faculty.name if user.faculty else ''

        if user.department_fk_id:
            token['department_id'] = user.department_fk_id
            token['department_name'] = user.department_fk.name if user.department_fk else ''

        return token
