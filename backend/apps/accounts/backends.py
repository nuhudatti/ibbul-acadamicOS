"""
Custom Authentication Backend - Production System
Supports secure dual authentication:
- Students: Login with Student ID (U22/FNS/CSC/XXXX)
- Admins/HOD/Examiners: Login with Email

Security Features:
- Case-insensitive authentication
- SQL injection protection via Django ORM
- Proper normalization
- Account status validation
- Password verification
"""
import re
import logging
from typing import Optional
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.conf import settings
from .models import UserRole

User = get_user_model()
logger = logging.getLogger(__name__)


class DualAuthenticationBackend(ModelBackend):
    """
    Production-grade authentication backend that supports:
    1. Student ID authentication (for STUDENT role) - Format: U22/FNS/CSC/XXXX
    2. Email authentication (for HOD/EXAMINER/ADMIN roles)
    
    Security Features:
    - Rate limiting protection
    - Case-insensitive matching
    - SQL injection protection
    - Account status validation
    - Comprehensive logging
    """
    
    MAX_LOGIN_ATTEMPTS = 5
    LOCKOUT_TIME = 300  # 5 minutes in seconds
    
    # Module 7: Password rehashing — check if password uses Argon2, rehash on login if not
    def _rehash_password_if_needed(self, user: User, password: str) -> bool:
        """Rehash password with Argon2 if currently using weaker hasher. Returns True if rehashed."""
        if not user.password or not user.password.startswith('argon2'):
            try:
                # Verify password with current hasher, then rehash with Argon2
                if user.check_password(password):
                    user.set_password(password)  # Will use first hasher (Argon2)
                    user.save(update_fields=['password'])
                    logger.info(f'Password rehashed to Argon2 for user: {user.email or user.student_id}')
                    return True
            except Exception as e:
                logger.warning(f'Password rehash failed for {user.email or user.student_id}: {e}')
        return False
    
    def _get_cache_key(self, username: str) -> str:
        """Generate cache key for login attempts"""
        return f'login_attempts_{username.lower()}'
    
    def _check_rate_limit(self, username: str) -> bool:
        """Check if user has exceeded login attempts"""
        cache_key = self._get_cache_key(username)
        attempts = cache.get(cache_key, 0)
        
        if attempts >= self.MAX_LOGIN_ATTEMPTS:
            logger.warning(f'Rate limit exceeded for username: {username}')
            return False
        return True
    
    def _increment_login_attempts(self, username: str):
        """Increment failed login attempts"""
        cache_key = self._get_cache_key(username)
        attempts = cache.get(cache_key, 0) + 1
        cache.set(cache_key, attempts, self.LOCKOUT_TIME)
        logger.warning(f'Failed login attempt {attempts} for username: {username}')
    
    def _reset_login_attempts(self, username: str):
        """Reset login attempts on successful login"""
        cache_key = self._get_cache_key(username)
        cache.delete(cache_key)
    
    def authenticate(
        self, 
        request, 
        username=None, 
        password=None, 
        **kwargs
    ) -> Optional[User]:
        """
        Authenticate user using either student_id or email
        
        Args:
            request: HTTP request
            username: Can be student_id or email
            password: User password
            
        Returns:
            User instance if authenticated, None otherwise
        """
        if username is None:
            username = kwargs.get('email') or kwargs.get('student_id')
        
        if username is None or password is None:
            return None
        
        # Normalize username (trim whitespace, prevent injection)
        username = username.strip()
        
        # Check rate limiting
        if not self._check_rate_limit(username):
            logger.warning(f'Authentication blocked due to rate limit: {username}')
            return None
        
        # Check if username is a student ID format (U22/FNS/CSC/XXXX)
        student_id_pattern = r'^U\d{2}/[A-Z]{3}/[A-Z]{3}/\d{4}$'
        is_student_id = bool(re.match(student_id_pattern, username.upper()))
        
        user = None
        try:
            if is_student_id:
                # Normalize to uppercase for student IDs
                normalized_username = username.upper()
                # Try to authenticate as student using student_id (case-insensitive)
                # Using get() with proper exception handling prevents SQL injection
                user = User.objects.get(
                    student_id__iexact=normalized_username,
                    role=UserRole.STUDENT
                )
            else:
                # Normalize to lowercase for emails
                normalized_username = username.lower()
                # Try to authenticate using email (case-insensitive)
                user = User.objects.get(email__iexact=normalized_username)
        except User.DoesNotExist:
            # User doesn't exist - increment attempts but don't reveal this
            self._increment_login_attempts(username)
            return None
        except User.MultipleObjectsReturned:
            # Handle edge case where multiple users exist (shouldn't happen with unique constraints)
            logger.error(f'Multiple users found for username: {username}')
            if is_student_id:
                user = User.objects.filter(
                    student_id__iexact=username.upper(),
                    role=UserRole.STUDENT
                ).first()
            else:
                user = User.objects.filter(email__iexact=username.lower()).first()
            if not user:
                self._increment_login_attempts(username)
                return None
        except Exception as e:
            # Log unexpected errors
            logger.error(f'Authentication error for username {username}: {str(e)}')
            return None
        
        # Check password and user status
        if user and user.check_password(password) and self.user_can_authenticate(user):
            # Module 7: Rehash password to Argon2 if needed (upgrade from PBKDF2/BCrypt)
            self._rehash_password_if_needed(user, password)
            # Successful authentication - reset attempts
            self._reset_login_attempts(username)
            logger.info(f'Successful authentication for user: {user.email if user.email else user.student_id}')
            return user
        
        # Failed authentication - increment attempts
        self._increment_login_attempts(username)
        return None
