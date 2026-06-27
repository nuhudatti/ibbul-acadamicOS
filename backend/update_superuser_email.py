"""
Update existing superuser to use email authentication (non-interactive)
Run: python update_superuser_email.py
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

def update_superuser():
    """Update existing superuser to use email instead of student_id"""
    print("=" * 60)
    print("Updating Superuser to Email Authentication")
    print("=" * 60)
    
    # Find superuser with student_id
    try:
        old_superuser = User.objects.filter(is_superuser=True).first()
        
        if not old_superuser:
            print("[INFO] No superuser found.")
            return
        
        print(f"\nFound superuser:")
        print(f"  Email: {old_superuser.email or '(empty)'}")
        print(f"  Student ID: {old_superuser.student_id or '(empty)'}")
        
        # If superuser already has email and no student_id, it's already migrated
        if old_superuser.email and not old_superuser.student_id:
            print("\n[SUCCESS] Superuser already uses email authentication!")
            print(f"Login with email: {old_superuser.email}")
            return
        
        # Set default email if not set
        if not old_superuser.email:
            old_superuser.email = 'admin@ibbul.edu.ng'
            print(f"\n[INFO] Setting email to: {old_superuser.email}")
        
        # Check if email already exists for another user
        if User.objects.filter(email=old_superuser.email).exclude(pk=old_superuser.pk).exists():
            # Generate unique email
            base_email = old_superuser.email.split('@')[0]
            domain = old_superuser.email.split('@')[1] if '@' in old_superuser.email else 'ibbul.edu.ng'
            counter = 1
            while User.objects.filter(email=f'{base_email}{counter}@{domain}').exists():
                counter += 1
            old_superuser.email = f'{base_email}{counter}@{domain}'
            print(f"[INFO] Email already exists, using: {old_superuser.email}")
        
        # Update superuser - remove student_id for admin
        old_student_id = old_superuser.student_id
        old_superuser.student_id = None  # Remove student_id for admin
        old_superuser.save()
        
        print("\n" + "=" * 60)
        print("[SUCCESS] SUPERUSER UPDATED!")
        print("=" * 60)
        print(f"Email: {old_superuser.email}")
        print(f"Old Student ID: {old_student_id} (removed)")
        print(f"Role: {old_superuser.role}")
        print("=" * 60)
        print("[INFO] Login credentials:")
        print(f"  Username: {old_superuser.email}")
        print(f"  Password: (your existing password)")
        print("=" * 60)
        print("[NOTE] Admins no longer use student_id for login")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[ERROR] Error updating superuser: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    update_superuser()
