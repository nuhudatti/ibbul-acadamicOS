"""
Script to create superuser with student ID
Run: python create_superuser.py
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

def create_superuser():
    """Create a superuser with student ID"""
    print("=" * 50)
    print("Create Superuser - IBBUL Result Checker")
    print("=" * 50)
    
    student_id = input("\nEnter Student ID (format: U22/FNS/CSC/XXXX): ").strip()
    
    if not student_id:
        print("Error: Student ID is required!")
        return
    
    # Check if user already exists
    if User.objects.filter(student_id=student_id).exists():
        print(f"Error: User with student ID '{student_id}' already exists!")
        return
    
    password = input("Enter password: ").strip()
    password_confirm = input("Confirm password: ").strip()
    
    if password != password_confirm:
        print("Error: Passwords do not match!")
        return
    
    if len(password) < 8:
        print("Error: Password must be at least 8 characters!")
        return
    
    try:
        user = User.objects.create_superuser(
            student_id=student_id,
            password=password,
            first_name=input("First name (optional): ").strip() or "",
            last_name=input("Last name (optional): ").strip() or "",
            email=input("Email (optional): ").strip() or ""
        )
        print(f"\n✅ Successfully created superuser: {user.student_id}")
        print(f"   Role: {user.role}")
        print(f"   Staff: {user.is_staff}")
        print(f"   Superuser: {user.is_superuser}")
    except Exception as e:
        print(f"\n❌ Error creating superuser: {str(e)}")

if __name__ == '__main__':
    create_superuser()
