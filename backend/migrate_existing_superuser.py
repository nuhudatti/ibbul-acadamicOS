"""
Migrate existing superuser from student_id to email authentication
Run this after migrations to update existing superuser
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

def migrate_superuser():
    """Update existing superuser to use email instead of student_id"""
    print("=" * 60)
    print("Migrate Existing Superuser")
    print("=" * 60)
    
    # Find superuser with student_id
    try:
        old_superuser = User.objects.filter(is_superuser=True, student_id__isnull=False).first()
        
        if not old_superuser:
            print("[INFO] No superuser with student_id found. Checking for any superuser...")
            old_superuser = User.objects.filter(is_superuser=True).first()
        
        if not old_superuser:
            print("[INFO] No superuser found. You can create one using create_admin_user.py")
            return
        
        print(f"\nFound superuser: {old_superuser}")
        print(f"Current email: {old_superuser.email or '(empty)'}")
        print(f"Current student_id: {old_superuser.student_id or '(empty)'}")
        
        # If superuser already has email and no student_id, it's already migrated
        if old_superuser.email and not old_superuser.student_id:
            print("\n[SUCCESS] Superuser already uses email authentication!")
            print(f"Login with email: {old_superuser.email}")
            return
        
        # Get new email
        new_email = input(f"\nEnter new email for superuser [{old_superuser.email or 'admin@ibbul.edu.ng'}]: ").strip()
        if not new_email:
            new_email = old_superuser.email or 'admin@ibbul.edu.ng'
        
        # Check if email already exists
        if User.objects.filter(email=new_email).exclude(pk=old_superuser.pk).exists():
            print(f"[ERROR] Email '{new_email}' already exists!")
            return
        
        # Update superuser
        old_superuser.email = new_email
        old_superuser.student_id = None  # Remove student_id for admin
        old_superuser.save()
        
        print("\n" + "=" * 60)
        print("[SUCCESS] SUPERUSER MIGRATED!")
        print("=" * 60)
        print(f"Email: {old_superuser.email}")
        print(f"Student ID: (removed - admins don't use student_id)")
        print(f"Role: {old_superuser.role}")
        print("=" * 60)
        print("[INFO] Login with email and password")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[ERROR] Error migrating superuser: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    migrate_superuser()
