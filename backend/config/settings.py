"""
Django Settings
Production-grade configuration with environment variables
"""
import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def _clean_env(key: str, default: str = '', *fallback_keys: str) -> str:
    """Read env var with optional fallbacks; strip whitespace and surrounding quotes."""
    for env_key in (key,) + fallback_keys:
        raw = os.getenv(env_key)
        if raw is None:
            continue
        val = str(raw).strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in '"\'':
            val = val[1:-1].strip()
        if val:
            return val
    return default

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent

# Add common directory to Python path
import sys
sys.path.insert(0, str(BASE_DIR))

# Security Settings
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-change-in-production')
DEBUG = os.getenv('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# Security Headers
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Session Security — Module 7: Secure flags, regenerate on login/password change
SESSION_COOKIE_AGE = 86400  # 24 hours
SESSION_COOKIE_HTTPONLY = True  # Prevent JavaScript access
SESSION_COOKIE_SAMESITE = 'Lax'  # CSRF protection; 'Lax' allows top-level redirects
SESSION_COOKIE_SECURE = not DEBUG  # HTTPS-only in production (set via DEBUG=False)
SESSION_SAVE_EVERY_REQUEST = False  # Only save on modification
SESSION_EXPIRE_AT_BROWSER_CLOSE = False  # Respect SESSION_COOKIE_AGE
CSRF_COOKIE_HTTPONLY = True  # Prevent JavaScript access
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = not DEBUG  # HTTPS-only in production
CSRF_USE_SESSIONS = False  # Use cookie-based CSRF token
CSRF_FAILURE_VIEW = 'django.views.csrf.csrf_failure'
CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(',')

# Cache Configuration (for rate limiting)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-snowflake',
        'OPTIONS': {
            'MAX_ENTRIES': 10000
        }
    }
}

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    
    # Local apps
    'apps.accounts',   # Identity layer (User model)
    'apps.core',       # Academic Core — single source of truth for structure
    'apps.academics',  # Results Module (consumes from accounts + core)
    'apps.learning',   # Learning Module (consumes from accounts + core)
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'apps.accounts.scope.ScopeMiddleware',  # Module 2: set request.scope from user role/faculty/department
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

if os.getenv('PERF_LOG_SLOW', '').strip() in ('1', 'true', 'yes'):
    MIDDLEWARE.append('common.middleware.performance.SlowRequestLoggingMiddleware')

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],  # Add templates directory
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'apps.accounts.context_processors.lecturer_context',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database — production uses DATABASE_URL (Neon, Railway, etc.)
# Legacy DB_* vars still supported. SQLite only when DEBUG=True and no URL set.
import dj_database_url
from django.core.exceptions import ImproperlyConfigured

DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600,
            ssl_require=not DEBUG,
        )
    }
elif DB_NAME and DB_USER and DB_PASSWORD:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': DB_NAME,
            'USER': DB_USER,
            'PASSWORD': DB_PASSWORD,
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
            'CONN_MAX_AGE': 600,
        }
    }
elif DEBUG:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    raise ImproperlyConfigured(
        'Production requires DATABASE_URL (PostgreSQL). '
        'Example: postgresql://user:pass@host/db?sslmode=require'
    )

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# Custom Authentication Backend
AUTHENTICATION_BACKENDS = [
    'apps.accounts.backends.DualAuthenticationBackend',  # Custom dual auth (student_id/email)
    'django.contrib.auth.backends.ModelBackend',  # Fallback to default
]

# Password validation - Production-grade security
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
        'OPTIONS': {
            'user_attributes': ('email', 'first_name', 'last_name', 'student_id'),
            'max_similarity': 0.7,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Password hashing — Module 7: Argon2 (production-grade, memory-hard) as primary; fallback to PBKDF2
# Check if argon2 is available, otherwise fall back to PBKDF2
try:
    import argon2
    ARGON2_AVAILABLE = True
except ImportError:
    ARGON2_AVAILABLE = False
    import warnings
    warnings.warn(
        'argon2-cffi is not installed. Install it with: pip install argon2-cffi\n'
        'Falling back to PBKDF2PasswordHasher. For production, Argon2 is recommended.',
        UserWarning
    )

# Build PASSWORD_HASHERS list conditionally
PASSWORD_HASHERS = []
if ARGON2_AVAILABLE:
    PASSWORD_HASHERS.append('django.contrib.auth.hashers.Argon2PasswordHasher')  # Primary: memory-hard, resistant to GPU/ASIC attacks
PASSWORD_HASHERS.extend([
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',  # Fallback: for existing passwords
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
])

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# Media — user-facing assets live on Cloudinary (URLs in DB). Local MEDIA_ROOT is for
# ephemeral result upload batches / error CSVs only (not served in production).
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_USE_CLOUDINARY = os.getenv('MEDIA_USE_CLOUDINARY', 'True') == 'True'

# Cloudinary (required for production media: logos, lesson video/PDF, branding)
CLOUDINARY_CLOUD_NAME = os.getenv('CLOUDINARY_CLOUD_NAME', '')
CLOUDINARY_API_KEY = os.getenv('CLOUDINARY_API_KEY', '')
CLOUDINARY_API_SECRET = os.getenv('CLOUDINARY_API_SECRET', '')
CLOUDINARY_BRANDING_FOLDER = os.getenv('CLOUDINARY_BRANDING_FOLDER', 'ibbul/branding')
CLOUDINARY_LEARNING_FOLDER = os.getenv('CLOUDINARY_LEARNING_FOLDER', 'ibbul/learning')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'DEFAULT_PARSER_CLASSES': (
        'rest_framework.parsers.JSONParser',
    ),
}

# JWT Settings - Production-grade security
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        minutes=int(os.getenv('JWT_ACCESS_TOKEN_LIFETIME', '60'))
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=int(os.getenv('JWT_REFRESH_TOKEN_LIFETIME_DAYS', '7'))
    ),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': os.getenv('JWT_ALGORITHM', 'HS256'),
    'SIGNING_KEY': os.getenv('JWT_SECRET_KEY', SECRET_KEY),
    'VERIFYING_KEY': None,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
    'JTI_CLAIM': 'jti',
    'SLIDING_TOKEN_REFRESH_EXP_CLAIM': 'refresh_exp',
    'SLIDING_TOKEN_LIFETIME': timedelta(minutes=5),
    'SLIDING_TOKEN_REFRESH_LIFETIME': timedelta(days=1),
    # Custom serializer that embeds role + module_access in the JWT payload
    'TOKEN_OBTAIN_SERIALIZER': 'apps.accounts.token_serializers.CustomTokenObtainPairSerializer',
}

# CORS Settings — set CORS_ALLOWED_ORIGINS in production (comma-separated HTTPS URLs)
_cors_env = _clean_env('CORS_ALLOWED_ORIGINS', '').strip()
if _cors_env:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_env.split(',') if o.strip()]
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]

CORS_ALLOW_CREDENTIALS = True

# Frontend base URL (for password reset links in email)
FRONTEND_BASE_URL = _clean_env('FRONTEND_BASE_URL', 'http://localhost:3000').rstrip('/')

# Auto-add live frontend to CORS (Vercel/Render) when FRONTEND_BASE_URL is HTTPS
if FRONTEND_BASE_URL.startswith('https://') and FRONTEND_BASE_URL not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = list(CORS_ALLOWED_ORIGINS) + [FRONTEND_BASE_URL]

# Institution branding (used in transactional emails)
INSTITUTION_NAME = os.getenv(
    'INSTITUTION_NAME',
    'Ibrahim Badamasi Babangida University, Lapai',
)
INSTITUTION_SHORT_NAME = os.getenv('INSTITUTION_SHORT_NAME', 'IBBUL')
PLATFORM_NAME = os.getenv('PLATFORM_NAME', 'IBBUL Academic OS')
PLATFORM_TAGLINE = os.getenv('PLATFORM_TAGLINE', 'Learning for Service')
EMAIL_LOGO_URL = os.getenv('EMAIL_LOGO_URL', '')  # Public HTTPS URL to logo image (PNG/JPG)
EMAIL_ACCENT_COLOR = os.getenv('EMAIL_ACCENT_COLOR', '#1a35af')
SUPPORT_EMAIL = os.getenv('SUPPORT_EMAIL', 'ict@ibbul.edu.ng')

# Email — SendGrid / SMTP (supports EMAIL_* and SMTP_* env names from other projects)
EMAIL_BACKEND = _clean_env(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend',
)
EMAIL_HOST = _clean_env('EMAIL_HOST', 'smtp.sendgrid.net', 'SMTP_HOST')
EMAIL_PORT = int(_clean_env('EMAIL_PORT', '587', 'SMTP_PORT') or '587')
_smtp_secure = _clean_env('SMTP_SECURE', '').lower()
if _smtp_secure in ('1', 'true', 'yes'):
    EMAIL_USE_SSL = True
    EMAIL_USE_TLS = False
else:
    EMAIL_USE_SSL = _clean_env('EMAIL_USE_SSL', '').lower() in ('1', 'true', 'yes')
    EMAIL_USE_TLS = _clean_env('EMAIL_USE_TLS', 'true').lower() in ('1', 'true', 'yes')
EMAIL_HOST_USER = _clean_env('EMAIL_HOST_USER', 'apikey', 'SMTP_USER')
EMAIL_HOST_PASSWORD = _clean_env('EMAIL_HOST_PASSWORD', '', 'SMTP_PASS')
DEFAULT_FROM_EMAIL = _clean_env(
    'DEFAULT_FROM_EMAIL',
    'IBBUL Academic OS <noreply@ibbul.edu.ng>',
    'SMTP_FROM',
)
EMAIL_REPLY_TO = _clean_env('EMAIL_REPLY_TO', '', 'SMTP_REPLY_TO')
EMAIL_TIMEOUT = int(_clean_env('EMAIL_TIMEOUT', '25') or '25')
EMAIL_SMTP_RETRY_MAX = int(_clean_env('EMAIL_SMTP_RETRY_MAX', _clean_env('SMTP_RETRY_MAX', '3')) or '3')
_retry_delay_raw = _clean_env('EMAIL_SMTP_RETRY_DELAY', '')
if _retry_delay_raw:
    EMAIL_SMTP_RETRY_DELAY = float(_retry_delay_raw)
else:
    EMAIL_SMTP_RETRY_DELAY = float(_clean_env('SMTP_RETRY_DELAY_MS', '1000') or '1000') / 1000.0
SENDGRID_USE_HTTP_API = _clean_env('SENDGRID_USE_HTTP_API', 'true').lower() in ('1', 'true', 'yes')
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Celery — Module 8: Background infrastructure & monitoring
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_RESULT_EXPIRES = 3600  # Results expire after 1 hour
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 3600  # Hard limit: 1 hour
CELERY_TASK_SOFT_TIME_LIMIT = 3300  # Soft limit: 55 minutes
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
# Error report download TTL (minutes)
UPLOAD_REPORT_DOWNLOAD_TTL_MINUTES = int(os.getenv('UPLOAD_REPORT_DOWNLOAD_TTL_MINUTES', '10'))

# Large result Excel / lesson media uploads (Render + Django defaults are ~2.5MB in memory)
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv('DATA_UPLOAD_MAX_MEMORY_SIZE', str(52_428_800)))  # 50 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv('FILE_UPLOAD_MAX_MEMORY_SIZE', str(52_428_800)))

# Logging — stdout/stderr only (Render, Railway, Docker, Gunicorn capture logs)
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

# Python 3.14 compatibility: Django's BaseContext.__copy__ uses copy(super()) which
# fails on 3.14. Patch to create a proper shallow copy and copy all instance attrs
# (e.g. .template, .render_context) so Context/RequestContext work in Template.render().
import sys
if sys.version_info >= (3, 14):
    from django.template.context import BaseContext
    def _basecontext_copy_py314(self):
        duplicate = object.__new__(type(self))
        for key, value in self.__dict__.items():
            setattr(duplicate, key, value)
        duplicate.dicts = self.dicts[:]
        return duplicate
    BaseContext.__copy__ = _basecontext_copy_py314

# Defensive patch: ensure context.template is never assumed. Some code paths (e.g. admin
# changelist with Python 3.14) can pass a context that doesn't have .template, causing
# AttributeError in django.template.base.Template.render(). Use getattr so we treat
# missing .template as None and bind the template as normal.
def _template_render_patched(self, context):
    with context.render_context.push_state(self):
        if getattr(context, 'template', None) is None:
            with context.bind_template(self):
                context.template_name = self.name
                return self._render(context)
        return self._render(context)

# Apply when settings load so admin changelist (and any Template.render) sees the fix.
def _apply_template_render_patch():
    from django.template.base import Template
    if not getattr(Template.render, '_patched_for_context_template', False):
        Template.render = _template_render_patched
        Template.render._patched_for_context_template = True

_apply_template_render_patch()
