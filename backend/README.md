# IBBUL Result Checker - Backend

Production-grade Django REST API for University Result Management System.

## Architecture Overview

```
backend/
├── config/          # Django project settings, URLs, WSGI/ASGI
├── apps/
│   ├── accounts/    # Authentication, User management (Student ID auth)
│   ├── academics/   # Courses, Results, GPA/CGPA calculation
│   └── departments/ # Department management
├── common/
│   ├── permissions/ # Role-based permissions (Student, Examiner, HOD)
│   ├── utils/       # Shared utilities
│   └── validators/  # Custom validators (Student ID format)
└── tests/           # Test suites
```

## Key Features

✅ **Custom Student ID Authentication**
- Format: `U22/FNS/CSC/XXXX` (e.g., U22/FNS/CSC/0001)
- Student ID is the primary authentication field (not email/username)
- Built-in format validation

✅ **JWT Authentication**
- SimpleJWT for stateless authentication
- Access & Refresh tokens
- Token rotation on refresh

✅ **Role-Based Access Control**
- Student: View own results
- Examiner: Upload/manage results
- HOD: Full department access

✅ **Production-Ready**
- Environment-based configuration
- PostgreSQL database
- Comprehensive logging
- Input validation & sanitization

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```env
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

DB_NAME=ibbul_result_checker
DB_USER=postgres
DB_PASSWORD=your-password
DB_HOST=localhost
DB_PORT=5432

JWT_SECRET_KEY=your-jwt-secret-key
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_LIFETIME=60
JWT_REFRESH_TOKEN_LIFETIME=1440
```

### 3. Setup Database

```bash
# Create PostgreSQL database
createdb ibbul_result_checker

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser (use student ID format)
python manage.py createsuperuser
# Enter student_id: U22/FNS/CSC/0001
```

### 4. Run Development Server

```bash
python manage.py runserver
```

## Production Auth (No Public Signup)

- **No public registration.** Users are created by admin via CSV/Excel import (Admin → Import users).
- **Login:** Students use **reg_number** (matric) + password; staff use **email** + password. Input is normalized (reg_number → uppercase).
- **First-login:** New users get a temporary password; on first login they are forced to change it before accessing the dashboard.
- **Temporary password export:** After CSV/Excel import, admin can download a **one-time CSV** (reg_number → temporary_password). The file is available only to the uploading admin, downloadable once or expires in 10 minutes; export event is audited and plaintext is deleted after download.
- **Forgot password:** If the user has a verified email, token-based reset; otherwise "Contact the administrator to reset your password."
- **Rate limiting:** Failed login attempts are rate-limited per account; temporary lockout after repeated failures. All events logged in audit_logs.
- **Result upload:** Results attach **only to existing students** (no user/student creation from upload). Invalid reg_number is rejected with a clear error.

## API Endpoints

### Authentication

**Login** (students: reg_number; staff: email)
```
POST /api/accounts/login/
Body: { "username": "U22/FNS/CSC/0001", "password": "..." }
Response: { "user": {...}, "tokens": { "access": "...", "refresh": "..." }, "is_first_login": true/false }
```

**First-login change password** (required when `is_first_login` is true)
```
POST /api/accounts/first-login/change-password/
Body: { "current_password": "...", "new_password": "...", "new_password_confirm": "..." }
```

**Get Profile**
```
GET /api/accounts/profile/
Headers: Authorization: Bearer <access_token>
```

### Students (typeahead for manual entry)

```
GET /api/academics/students/?search=u22&limit=10
Headers: Authorization: Bearer <access_token>
Returns: { "count": N, "students": [...] }  (staff only; reg_number in uppercase)
```

## Student ID Format

The system uses a custom student ID format:
- **Pattern**: `U22/FNS/CSC/XXXX`
- **Example**: `U22/FNS/CSC/0001`
- **Components**:
  - `U22`: Year prefix (U + 2 digits)
  - `FNS`: Faculty code (3 uppercase letters)
  - `CSC`: Department code (3 uppercase letters)
  - `XXXX`: 4-digit student number

## Why No Firebase?

**Django + PostgreSQL is sufficient** for this use case:
- ✅ Single source of truth (no sync issues)
- ✅ Custom authentication with student ID
- ✅ Built-in role-based permissions
- ✅ Simpler architecture
- ✅ Lower cost & complexity
- ✅ Better for academic data (relational queries)

Firebase would add unnecessary complexity when Django handles everything natively.

## Development Standards

- **snake_case** for functions & files
- **PascalCase** for classes
- **Type hints** everywhere
- **Fat services, thin views** (business logic in services)
- **No logic in serializers** (validation only)
- **Environment variables** for all secrets

## Acceptance Checklist (Production Auth)

1. **CSV import:** Rows with reg_number (students) or email (staff) create users; students require reg_number; staff require email; faculty/department optional for staff.
2. **Upload UI:** Staff can type reg_number or name; typeahead suggests matches (`/api/academics/students/?search=...&limit=10`); invalid reg_number is rejected on submit.
3. **New user:** Receives unique temp password; one-time CSV export (TTL 10 min); on first login forced to change password before dashboard.
4. **Forgot password:** Works only if email verified; otherwise "Contact the administrator."
5. **No signup:** All signup/register routes removed; no public account creation.
6. **Audit logs:** Admin import, temp password export, login success/fail, password change; append-only.
7. **Rate limiting:** Failed logins rate-limited; temporary lockout after repeated failures.
8. **Case normalization:** reg_number stored and matched in uppercase; login and search case-insensitive.

### Staff User Management (HODs / Faculty Admin / Examiners)

9. **Django Admin Users:** `/admin/accounts/user/` — SUPER_ADMIN can create/edit any role (SUPER_ADMIN, FACULTY_ADMIN, DEPARTMENT_ADMIN, EXAMINER, STUDENT) with email/reg_number, first_name, last_name, role, faculty, department_fk, is_active, is_staff, is_superuser, is_first_login. Password: set or leave blank to auto-generate (user must change on first login).
10. **CSV import staff:** Rows with email + role (EXAMINER, DEPARTMENT_ADMIN, FACULTY_ADMIN, etc.) create staff; optional columns faculty_code, department_code (or faculty, department) assign scope.
11. **Hub link:** Users/Accounts hub shows "Users (create/edit HODs, Faculty Admin, Examiners, Students)" linking to `/admin/accounts/user/`.

## Users / Accounts (Admin)

- **Hub:** `/admin/users-accounts/` — Users (create/edit), Add student, Import users, User management, Audit logs.
- **Users (Django Admin):** `/admin/accounts/user/` — **Create/Edit** any role (SUPER_ADMIN, FACULTY_ADMIN, DEPARTMENT_ADMIN/HOD, EXAMINER, STUDENT). Fields: email (or reg_number for students), first_name, last_name, role, faculty, department_fk, is_active, is_staff, is_superuser, is_first_login. Password: set manually or leave blank to **auto-generate** a temporary password (user must change on first login).
- **Add student (manual):** `/admin/add-student/` — Reg number, full name, department, level. System generates a unique temporary password; **one-time CSV download** (expires in 10 min). Student must change password on first login.
- **Import users (CSV/Excel):** `/admin/import-users/` — Bulk create users with temp passwords. **Students:** reg_number (required), first_name, last_name, role, email (optional). **Staff (HOD/Faculty Admin/Examiner):** email (required), first_name, last_name, role; optional **faculty** (code or name), **department** (code or name) for scope. After import, **Download one-time CSV** (identifier → temporary_password). TTL 10 min; export event audited.
- **User management:** `/admin/user-management/` — Reset to temp password, set custom password, activate/deactivate. All actions audited.
- **Audit logs:** `/admin/audit-logs/` — Append-only log of import, temp password export, password reset, activation/deactivation.

## Module 8 — Background Infrastructure & Monitoring

### Celery Configuration

The system uses Celery for background task processing (result uploads, periodic maintenance).

**Configuration:**
- Broker: Redis (`CELERY_BROKER_URL`)
- Result backend: Redis (`CELERY_RESULT_BACKEND`)
- Task queues: `default`, `uploads`
- Periodic tasks: Session cleanup (daily), audit log archival (monthly)

**Running Celery:**

```bash
# Start Redis (if not using Docker)
redis-server

# Start Celery worker
celery -A config worker --loglevel=info --concurrency=2 --queues=default,uploads

# Start Celery beat (periodic tasks)
celery -A config beat --loglevel=info

# Start Flower (monitoring UI)
celery -A config flower --port=5555
```

### Docker Compose

Full infrastructure stack with PostgreSQL, Redis, Celery workers, Flower, and MinIO:

```bash
# Copy environment file
cp docker-compose.env.example .env
# Edit .env with your values

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Services:**
- `db`: PostgreSQL database
- `redis`: Redis broker/backend
- `celery_worker`: Background task worker
- `celery_beat`: Periodic task scheduler
- `flower`: Celery monitoring UI (http://localhost:5555)
- `minio`: S3-compatible object storage (http://localhost:9000, console: http://localhost:9001)
- `web`: Django application (http://localhost:8000)

### Monitoring Endpoints

**Health Check** (public, no auth):
```
GET /health
Response: { "status": "healthy", "checks": { "database": "ok", "cache": "ok", "celery": "ok" } }
```

**Metrics** (staff only):
```
GET /metrics
Headers: Authorization: Bearer <access_token>
Response: { "users": {...}, "results": {...}, "course_batches": {...}, "celery": {...} }
```

### Admin Job Dashboard

Monitor Celery tasks, retry failed uploads:
```
/admin/job-dashboard/
```

Features:
- Active/running tasks
- Scheduled tasks
- Reserved tasks
- Worker statistics
- Recent upload batches with retry capability

## Commands

```bash
python manage.py migrate
python manage.py createsuperuser   # if needed (staff use email)
python manage.py runserver
python manage.py test             # run tests
python manage.py seed_demo_users  # create demo student + admin (see LOGIN_CREDENTIALS.md)

# Celery commands
celery -A config worker --loglevel=info
celery -A config beat --loglevel=info
celery -A config flower --port=5555

# Docker commands
docker-compose up -d
docker-compose logs -f celery_worker
docker-compose restart celery_worker
```
