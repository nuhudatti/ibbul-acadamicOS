# Quick Start Guide

## What's Been Built

✅ **Complete Django Backend Structure**
- Custom User model with Student ID authentication (`U22/FNS/CSC/XXXX`)
- JWT authentication system (SimpleJWT)
- Role-based permissions (Student, Examiner, HOD)
- Registration & Login endpoints
- Production-ready configuration

## Firebase Question - ANSWERED

**❌ NO Firebase needed!**

**Why Django + PostgreSQL is better:**
1. **Single Database** - All data (users, results, grades) in one place
2. **Custom Authentication** - Student ID is now the username field
3. **Built-in Security** - Django handles password hashing, JWT tokens, permissions
4. **Simpler Architecture** - No sync between Firebase and PostgreSQL
5. **Cost Effective** - No Firebase billing
6. **Better for Academic Data** - Relational queries for GPA/CGPA calculations

## Student ID Format

Your system uses: **`U22/FNS/CSC/XXXX`**
- `U22` = Year (U + 2 digits)
- `FNS` = Faculty code (3 letters)
- `CSC` = Department code (3 letters)  
- `XXXX` = 4-digit student number

**Example:** `U22/FNS/CSC/0001`

This is stored directly in PostgreSQL - no external service needed!

## Next Steps to Run

1. **Install dependencies** (if not already done):
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Create `.env` file**:
   ```env
   SECRET_KEY=your-secret-key-change-this
   DEBUG=True
   DB_NAME=ibbul_result_checker
   DB_USER=postgres
   DB_PASSWORD=your-password
   ```

3. **Setup database**:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

4. **Create superuser** (use student ID format):
   ```bash
   python manage.py createsuperuser
   # Enter: U22/FNS/CSC/0001
   ```

5. **Run server**:
   ```bash
   python manage.py runserver
   ```

## Test the API

**Register a user:**
```bash
curl -X POST http://localhost:8000/api/accounts/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "U22/FNS/CSC/0001",
    "password": "password123",
    "password_confirm": "password123",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:8000/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "U22/FNS/CSC/0001",
    "password": "password123"
  }'
```

## Architecture Decisions Explained

### Why Custom User Model?
- Student ID must be the authentication field (not email/username)
- Django's default User uses username/email - we override this
- Custom manager handles student ID validation

### Why Services Layer?
- **Fat services, thin views** - business logic separated from HTTP
- Easier to test and maintain
- Can be reused by other consumers (admin, CLI, etc.)

### Why JWT?
- Stateless authentication (scales better)
- Mobile-friendly (no sessions)
- Token rotation for security

### Why Role-Based Permissions?
- Students can only view their own results
- Examiners can upload results
- HODs have full department access
- Centralized permission classes for reuse

## File Structure

```
backend/
├── config/              # Django settings, URLs
│   ├── settings.py      # Main configuration
│   └── urls.py          # URL routing
├── apps/
│   └── accounts/        # Authentication app
│       ├── models.py    # Custom User model
│       ├── serializers.py  # Request/response validation
│       ├── services.py  # Business logic (registration, login)
│       ├── views.py     # HTTP endpoints (thin layer)
│       └── urls.py      # Account URLs
├── common/
│   ├── validators/      # Student ID format validator
│   └── permissions/     # Role-based permission classes
└── manage.py            # Django CLI
```

## What's Next?

The backend foundation is complete! Ready to build:
- Academics app (Courses, Results, GPA/CGPA calculation)
- Department management
- Result upload endpoints
- Automated GPA/CGPA services
