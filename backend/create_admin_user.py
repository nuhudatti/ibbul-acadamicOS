"""
Create admin/HOD user with email (no student_id required)
Run: python create_admin_user.py
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

def create_admin_user():
    """Create an admin/HOD user with email"""
    print("=" * 60)
    print("Create Admin/HOD User - IBBUL Result Checker")
    print("=" * 60)
    
    email = input("\nEnter Email: ").strip()
    
    if not email:
        print("[ERROR] Email is required!")
        return
    
    # Check if user already exists
    if User.objects.filter(email=email).exists():
        print(f"[ERROR] User with email '{email}' already exists!")
        return
    
    password = input("Enter password: ").strip()
    password_confirm = input("Confirm password: ").strip()
    
    if password != password_confirm:
        print("[ERROR] Passwords do not match!")
        return
    
    if len(password) < 8:
        print("[ERROR] Password must be at least 8 characters!")
        return
    
    role_input = input("Role (HOD/EXAMINER) [default: HOD]: ").strip().upper()
    role = role_input if role_input in ['HOD', 'EXAMINER'] else 'HOD'
    
    is_superuser_input = input("Make superuser? (y/n) [default: y]: ").strip().lower()
    is_superuser = is_superuser_input != 'n'
    
    try:
        if is_superuser:
            user = User.objects.create_superuser(
                email=email,
                password=password,
                first_name=input("First name (optional): ").strip() or "",
                last_name=input("Last name (optional): ").strip() or "",
                role=role
            )
        else:
            user = User.objects.create_user(
                email=email,
                password=password,
                first_name=input("First name (optional): ").strip() or "",
                last_name=input("Last name (optional): ").strip() or "",
                role=role
            )
        
        print("\n" + "=" * 60)
        print("[SUCCESS] USER CREATED SUCCESSFULLY!")
        print("=" * 60)
        print(f"Email: {user.email}")
        print(f"Password: {password}")
        print(f"Role: {user.role}")
        print(f"Staff: {user.is_staff}")
        print(f"Superuser: {user.is_superuser}")
        print("=" * 60)
        print("[INFO] Login with email and password (no student_id needed)")
        print("=" * 60)
    except Exception as e:
        print(f"\n[ERROR] Error creating user: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    create_admin_user()
