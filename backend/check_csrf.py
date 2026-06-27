import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings

print('CSRF Middleware Check:')
print('=' * 50)
csrf_middleware = 'django.middleware.csrf.CsrfViewMiddleware'
if csrf_middleware in settings.MIDDLEWARE:
    print('[OK] CSRF Middleware is ENABLED')
else:
    print('[ERROR] CSRF Middleware is MISSING')

print('\nCookie Settings:')
print(f'SESSION_COOKIE_AGE: {settings.SESSION_COOKIE_AGE} seconds')
print(f'CSRF_COOKIE_AGE: {settings.CSRF_COOKIE_AGE} seconds')
