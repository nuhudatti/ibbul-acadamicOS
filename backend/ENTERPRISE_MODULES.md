  # Enterprise Conversion — IBBUL Result Management System

  This document tracks the **enterprise conversion** (refactor, do not rebuild) applied to the Django 5.x + React codebase. Work is done **module-by-module**; each module can be committed separately.

  ---

  ## Module 1 — MODELS & MIGRATIONS ✅ (Done)

  **Implemented:**

  - **User.role** extended with enterprise enum:
    - `SUPER_ADMIN`, `FACULTY_ADMIN`, `DEPARTMENT_ADMIN`, `EXAMINER`, `STUDENT`
    - Legacy `HOD` kept in choices; data migration maps `HOD` → `DEPARTMENT_ADMIN`
  - **User.faculty** (FK to `academics.Faculty`, nullable), **User.department_fk** (FK to `academics.Department`, nullable). **User.department** kept as CharField for display/backward compat.
  - **CourseAssignment** model: examiner (User FK, limit_choices_to EXAMINER), course FK; unique_together (examiner, course).
  - **Faculty, Department, Course**: already present; FKs unchanged.
  - **ResultUploadBatch**: added **progress** (PositiveIntegerField, default=0) for background uploads.
  - **ResultRow, CourseBatch**: already present.
  - **AuditLog** extended: **actor_role**, **scope_faculty** (FK), **scope_department** (FK); ip_address, user_agent, extra (meta) already present.
  - **AuditLogDeletion** archive model: stores moved log rows when SUPER_ADMIN “deletes” (Module 6 will wire this).
  - **Migrations**: `academics.0005_enterprise_course_assignment_and_batch_progress`, `accounts.0005_enterprise_roles_scope_audit`, `accounts.0006_migrate_hod_to_department_admin`.
  - **Management command**: `python manage.py seed_demo` — seeds 2 faculties (FNS, FES), 3 departments (CSC, MTH, EEE), sample courses, 1 SUPER_ADMIN, 1 FACULTY_ADMIN, 1 DEPARTMENT_ADMIN, 2 EXAMINERs (with CourseAssignment), 10 students. Password for all: `Demo@123`.
  - **Permissions**: `IsHOD` and related classes treat `DEPARTMENT_ADMIN` (and legacy `HOD`) as HOD-equivalent. `create_superuser` sets role `SUPER_ADMIN`. Admin import and signals map enterprise roles to Django groups (HOD, Admin).

  **Constraints respected:** No auto-creation of students or courses during upload; existing GPA/CGPA logic unchanged.

  ---

  ## Module 2 — SCOPE ENFORCEMENT ✅ (Done)

  **Implemented:**

  - **ScopeMiddleware** (`apps.accounts.scope.ScopeMiddleware`): sets `request.scope` from `request.user` (role, faculty, department_fk). Registered in `config.settings.MIDDLEWARE` after `AuthenticationMiddleware`.
  - **ScopeContext** and **ScopeLevel** (GLOBAL, FACULTY, DEPARTMENT, EXAMINER, STUDENT): `build_scope(user)` returns scope; EXAMINER gets `assigned_course_ids` from `CourseAssignment`.
  - **filter_by_scope(queryset, user, request=None)**: filters by scope for Faculty, Department, Course, Result, CourseBatch, ResultUploadBatch, CourseAssignment, User. SUPER_ADMIN sees all; FACULTY_ADMIN by faculty; DEPARTMENT_ADMIN by department; EXAMINER by assigned courses; STUDENT by own results.
  - **@scope_required(level)** decorator: view-level check; returns 403 if `request.scope.level` &lt; level.
  - **DRF ScopePermission** (`apps.academics.permissions.ScopePermission`): `has_permission` checks scope level (view can set `scope_level`); `has_object_permission` checks object within scope (faculty/department/course/student).
  - **Admin view-level checks**: `ScopeFilteredAdminMixin` on FacultyAdmin, DepartmentAdmin, CourseAdmin, ResultAdmin, CourseBatchAdmin, CourseAssignmentAdmin; `get_queryset` uses `filter_by_scope`.
  - **Unit tests**: `tests.test_scope` — BuildScopeTests, FilterByScopeTests, ScopeMiddlewareTests, ScopePermissionTests (17 tests).

  ---

  ## Module 3 — UPLOAD API + BACKGROUND PROCESSING ✅ (Done)

  **Implemented:**

  - **Frontend**: `UploadResults.jsx` — session/semester, file (CSV/Excel), preview (first 10 rows for CSV), submit → POST; batch card with status, progress (poll every 2s), success/error counts, one-time error report download link, retry. New "Upload" tab in Admin dashboard.
  - **Backend**: POST `/api/admin/upload-results/` — multipart file + session + semester; creates `ResultUploadBatch`, saves file to `media/upload_batches/<id>_<name>`, enqueues Celery task (or runs synchronously if no broker/Celery).
  - **Celery** (optional): `config/celery.py`, `apps.academics.tasks.process_upload_batch_task`; broker `CELERY_BROKER_URL` (e.g. redis). If not set or Celery not installed, API runs `ResultUploadService.process_upload_batch_from_file(batch_id)` synchronously.
  - **Chunked processing**: `ResultUploadService.process_upload_batch_from_file(batch_id)` — reads CSV/Excel in chunks, validates rows, creates Result + CourseBatch + ResultRow (ERROR or ATTACHED), updates batch progress/success_count/error_count; generates failed_rows CSV → `media/reports/<id>_errors.csv`, one-time token (TTL 10 min); AuditLog RESULT_UPLOAD_COMPLETED.
  - **API**: GET `/api/admin/upload-results/<id>/` — batch status, progress, `error_report_download_url`; GET `/api/admin/upload-results/<id>/download-report/?token=xxx` — one-time download (no auth), invalidates token; POST `/api/admin/upload-results/<id>/retry/` — re-enqueue same file (deletes existing ResultRows/Results for batch).
  - **Model**: `ResultUploadBatch` — `upload_file_path`, `report_download_token`, `report_download_expires_at` (migration `0006_upload_batch_file_and_report`).
  - **Settings**: `MEDIA_ROOT`, `MEDIA_URL`; `CELERY_BROKER_URL`, `UPLOAD_REPORT_DOWNLOAD_TTL_MINUTES`.

  ---

  ## Module 4 — APPROVAL & PUBLISHING (Pending)

  - POST `/api/coursebatches/{id}/approve/` and reject; scope checks (DEPARTMENT_ADMIN, FACULTY_ADMIN, SUPER_ADMIN).
  - CourseBatch.status=APPROVED, Result.status=APPROVED, lock results (is_editable=False if field added).
  - Frontend CourseBatchDashboard.jsx; bulk-approve with audit note.

  ---

  ## Module 5 — EXAMINER VIEW-ONLY FLOW (Done)

  - No upload/approve for EXAMINER; ExaminerDashboard.jsx — assigned courses and result lists, export CSV (read-only).
  - CourseAssignment drives visibility; tests: EXAMINER gets 403 on upload/approve.

  ---

  ## Module 6 — AUDIT LOGS & IMMUTABILITY (Pending)

  - audit.log() with actor_role, scope; append-only enforcement (optional raise on update).
  - POST `/api/audit/delete/` (SUPER_ADMIN only): move to AuditLogDeletion, write deletion AuditLog.
  - All exports: single-use signed URLs with TTL; log export.

  ---

  ## Module 7 — SECURITY & HARDENING (Pending)

  - Argon2 in PASSWORD_HASHERS; rehash on login if not Argon2.
  - Session flags (SECURE, HTTPONLY, SAMESITE); regenerate session on login/password change.
  - Rate limiting (login, forgot-password); CSRF; S3 presigned URLs.

  ---

  ## Module 8 — BACKGROUND INFRASTRUCTURE & MONITORING (Pending)

  - celery.py, docker-compose (redis, worker, flower, minio).
  - /health, /metrics; admin job dashboard (queued/running/failed, retry).

  ---

  ## Module 9 — FRONTEND UI/UX (Pending)

  - AdminUsersHub.jsx, UploadResults.jsx, CourseBatchDashboard.jsx, ExaminerDashboard.jsx, AuditLogPage.jsx.
  - Responsive, accessible, confirm modals, progress bars, microcopy for TTL.

  ---

  ## Module 10 — TESTS & CI (Pending)

  - test_upload_processing, test_coursebatch_approval, test_scope_enforcement, test_audit_logs, test_security.
  - GitHub Actions CI; fail on &lt;80% coverage.

  ---

  ## Module 11 — DEPLOYMENT & DOCUMENTATION (Pending)

  - Dockerfile (web, worker), docker-compose, render.yaml, k8s/helm skeleton.
  - README, CSV_TEMPLATES/, ACCEPTANCE.md, backup/retention runbook.

  ---

  ## Run locally (after Module 1)

  ```bash
  cd backend
  pip install -r requirements.txt
  python manage.py migrate
  python manage.py seed_demo
  python manage.py runserver
  ```

  **Demo logins (password: `Demo@123`):**

  - SUPER_ADMIN: `admin@ibbul.edu.ng`
  - FACULTY_ADMIN: `dean.fns@ibbul.edu.ng`
  - DEPARTMENT_ADMIN: `hod.csc@ibbul.edu.ng`
  - EXAMINER: `lecturer1@ibbul.edu.ng`, `lecturer2@ibbul.edu.ng`
  - STUDENT: `U22/FNS/CSC/0001` (or 0002–0010)

  ---

  ## Acceptance criteria (reference)

  1. Upload CSV with unknown reg_number → row rejected, in import report; no student created.
  2. 10k+ rows via background worker with chunking; no OOM; batch completes; report available.
  3. CourseBatch per course/session/semester; DEPARTMENT_ADMIN approves → Results APPROVED and locked.
  4. EXAMINER cannot upload or approve (403); can view assigned courses.
  5. FACULTY_ADMIN can view/approve within faculty; SUPER_ADMIN global.
  6. Temp-password / failed-rows CSV: single-use TTL link (10 min); export logged.
  7. Argon2 enabled; rehash path documented.
  8. CI runs tests and passes.
