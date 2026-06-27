"""
Create default superuser with student ID U22/FNS/CSC/0001
Run: python create_default_superuser.py
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

def create_default_superuser():
    """Create a default superuser"""
    student_id = 'U22/FNS/CSC/0001'
    password = 'admin123456'  # Change this in production!
    
    # Check if superuser already exists
    if User.objects.filter(student_id=student_id).exists():
        print(f"[SUCCESS] Superuser '{student_id}' already exists!")
        user = User.objects.get(student_id=student_id)
        print(f"   Role: {user.role}")
        print(f"   Staff: {user.is_staff}")
        print(f"   Superuser: {user.is_superuser}")
        return
    
    try:
        user = User.objects.create_superuser(
            student_id=student_id,
            password=password,
            first_name='Admin',
            last_name='User',
            email='admin@ibbul.edu.ng'
        )
        print("=" * 60)
        print("[SUCCESS] SUPERUSER CREATED SUCCESSFULLY!")
        print("=" * 60)
        print(f"Student ID: {user.student_id}")
        print(f"Password: {password}")
        print(f"Role: {user.role}")
        print(f"Email: {user.email}")
        print("=" * 60)
        print("[WARNING] IMPORTANT: Change the password in production!")
        print("=" * 60)
    except Exception as e:
        print(f"[ERROR] Error creating superuser: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    create_default_superuser()
