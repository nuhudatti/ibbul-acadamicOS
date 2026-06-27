"""Enterprise setup wizard API — available only before first Super Admin exists."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .setup_service import (
    SetupAlreadyComplete,
    complete_setup,
    get_setup_status,
    is_setup_required,
)


@api_view(['GET'])
@permission_classes([AllowAny])
def setup_status(request):
    """
    GET /api/core/setup/status/
    Public — tells frontend whether to show /setup wizard.
    """
    return Response(get_setup_status())


@api_view(['POST'])
@permission_classes([AllowAny])
def setup_complete(request):
    """
    POST /api/core/setup/complete/
    Create the first Super Admin. Permanently disabled once one exists.
    """
    if not is_setup_required():
        return Response(
            {'error': 'Setup has already been completed. Sign in at /login.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    data = request.data or {}
    try:
        user = complete_setup(
            email=str(data.get('email', '')).strip(),
            password=str(data.get('password', '')),
            first_name=str(data.get('first_name', 'Super')),
            last_name=str(data.get('last_name', 'Admin')),
            platform_name=str(data.get('platform_name', '')),
            institution_name=str(data.get('institution_name', '')),
            tagline=str(data.get('tagline', '')),
        )
    except SetupAlreadyComplete as exc:
        return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            'success': True,
            'message': 'Enterprise setup complete. You can sign in and use Forgot password anytime.',
            'email': user.email,
            'login_url': '/login',
        },
        status=status.HTTP_201_CREATED,
    )
