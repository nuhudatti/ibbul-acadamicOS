"""
Authentication Services
Business logic for user registration and authentication
Fat services pattern - all business logic here, not in views
"""
from typing import Dict, Any, Optional, Tuple
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User

User = get_user_model()


class AuthenticationService:
    """Service for handling authentication business logic"""
    
    @staticmethod
    def register_user(
        email: str,
        student_id: str,
        password: str,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        role: str = 'STUDENT'
    ) -> Tuple[User, Dict[str, str]]:
        """
        Public registration is disabled. No signup; users are created by admin (CSV/Excel import).
        Raises ValueError if called.
        """
        raise ValueError(
            'Public registration is disabled. Contact the administrator to get an account.'
        )

    @staticmethod
    def login_user(username: str, password: str) -> Tuple[User, Dict[str, str]]:
        """
        Authenticate user and generate JWT tokens
        Supports both student_id (for students) and email (for admins)
        
        Args:
            username: Student ID (for students) or Email (for admins/HOD/Examiners)
            password: User password
            
        Returns:
            Tuple of (User instance, tokens dict)
            
        Raises:
            ValueError: If authentication fails
        """
        from django.contrib.auth import authenticate
        import re
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Normalize username
        username = username.strip() if username else None
        
        if not username or not password:
            raise ValueError('Username and password are required.')
        
        # Check if it's a student ID format and normalize to uppercase
        student_id_pattern = r'^U\d{2}/[A-Z]{3}/[A-Z]{3}/\d{4}$'
        is_student_id = bool(re.match(student_id_pattern, username.upper()))
        
        if is_student_id:
            normalized_username = username.upper()  # Normalize student ID to uppercase
        else:
            normalized_username = username.lower()  # Normalize email to lowercase
        
        # Authenticate using custom backend (includes rate limiting)
        user = authenticate(username=normalized_username, password=password)
        
        if not user:
            # Generic error message to prevent user enumeration
            logger.warning(f'Failed login attempt for: {normalized_username}')
            raise ValueError('Invalid credentials. Please check your Student ID/Email and password.')
        
        if not user.is_active:
            logger.warning(f'Login attempt for inactive account: {normalized_username}')
            raise ValueError('Your account is disabled. Please contact support.')
        
        # Generate JWT tokens
        try:
            refresh = RefreshToken.for_user(user)
            tokens = {
                'access': str(refresh.access_token),
                'refresh': str(refresh)
            }
            logger.info(f'Successful login for user: {user.email if user.email else user.student_id}')
        except Exception as e:
            logger.error(f'Error generating tokens: {str(e)}')
            raise ValueError('Authentication successful but token generation failed. Please try again.')
        
        return user, tokens
    
    @staticmethod
    def refresh_access_token(refresh_token: str) -> Dict[str, str]:
        """
        Generate new access token from refresh token
        
        Args:
            refresh_token: JWT refresh token string
            
        Returns:
            Dict with new access token
            
        Raises:
            ValueError: If refresh token is invalid
        """
        try:
            refresh = RefreshToken(refresh_token)
            return {
                'access': str(refresh.access_token)
            }
        except Exception as e:
            raise ValueError(f'Invalid refresh token: {str(e)}')
