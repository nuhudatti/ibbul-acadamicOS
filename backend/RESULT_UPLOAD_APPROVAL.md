# Result Upload → Review → Approval (Production Flow)

This document describes the **result upload**, **batch processing**, and **course-batch approval** pipeline. It follows the principle: **students and courses are the source of truth**; uploads never create them.

---

## 1. Data model (new)

- **Faculty** – e.g. Faculty of Natural Sciences (FNS). Used for scope and reporting.
- **Department** – belongs to a Faculty (e.g. CSC under FNS). Used for scope (HOD/Lecturer).
- **Course** – optional `department` FK. **Catalogue only**: courses must be added in Admin → Courses before any result upload.
- **ResultUploadBatch** – one per file upload: filename, uploaded_by, status (PENDING → PROCESSING → COMPLETED/FAILED), success_count, error_count, completed_at.
- **ResultRow** – one per file row: batch, line_no, reg_number, course_code, score, session, semester, status (ATTACHED | ERROR), error_message, result (FK when ATTACHED).
- **CourseBatch** – one per (course, session, semester): status PENDING → APPROVED_BY_HOD | REJECTED | REOPEN | PUBLISHED, submitted_by, approved_by, approved_at, rejection_reason.

---

## 2. Validation rules (non-negotiable)

- **reg_number**: Normalized to UPPERCASE. Must exist in `User` (role=STUDENT). If not → row rejected with: *"Student with reg_number "…" is not in the system. Add the student via Admin user import first."*
- **course_code**: Must exist in `Course` (catalogue). If not → row rejected with: *"Course "…" is not in the catalogue. Add the course via Admin (Courses) first."*
- **score**: 0–100. Invalid or out of range → row rejected.
- **No automatic creation** of students, courses, or departments from uploads.

---

## 3. Upload flow (admin)

1. **Admin → Results → Upload results** (or Add Result).
2. Choose file (CSV/Excel), session, semester → **Upload & Analyze Results**.
3. Backend:
   - Builds list of rows with required fields (student_id, course_code, score, session, semester).
   - Creates **ResultUploadBatch** (status PROCESSING).
   - **Audit**: `RESULT_UPLOAD_STARTED` (filename, row_count).
   - For each row:
     - Validate student exists → else ResultRow(status=ERROR, error_message).
     - Validate course exists → else ResultRow(ERROR).
     - Validate score 0–100, no duplicate (student, course, session, semester) → else ResultRow(ERROR).
     - On success: get_or_create **CourseBatch** (course, session, semester, status=PENDING), create **Result** (status=PENDING), create **ResultRow**(status=ATTACHED, result=…).
   - Batch status → COMPLETED, success_count, error_count, completed_at.
   - **Audit**: `RESULT_UPLOAD_COMPLETED` (batch_id, success_count, error_count).
4. Page shows last batch: **Success / Failed** and **Download import report (CSV)** (failed rows: line_no, reg_number, course_code, error_message).

---

## 4. Course batch approval (HOD)

1. **Admin → Academics → Course batches**.
2. Filter by status, session, semester, department.
3. For each batch with status **PENDING** or **REOPEN**:
   - **Approve** → CourseBatch.status = APPROVED_BY_HOD, all **Result** for (course, session, semester) → status=APPROVED, approved_by, approved_at. **Audit**: `RESULT_BATCH_APPROVED`.
   - **Reject** → CourseBatch.status = REJECTED, rejection_reason. **Audit**: `RESULT_BATCH_REJECTED`.

Students see only results whose status is APPROVED (and, if you use it, only when CourseBatch is PUBLISHED – policy is configurable).

---

## 5. Audit log

All of the following are appended to **Audit logs** (actor, identifier, IP, meta):

- `RESULT_UPLOAD_STARTED` – filename, row_count, session, semester.
- `RESULT_UPLOAD_COMPLETED` – batch_id, success_count, error_count, filename.
- `RESULT_BATCH_APPROVED` – course_batch_id, course code, session, semester, results_updated.
- `RESULT_BATCH_REJECTED` – course_batch_id, reason.

---

## 6. Migrations and tests

- **Migrations**: `python manage.py migrate` (applies `academics.0004_add_faculty_department_batch_models`).
- **Tests**: `python manage.py test tests.test_result_upload`  
  - Unknown reg_number rejected (no student created).  
  - Unknown course rejected (no course created).  
  - Batch processing: invalid rows → ResultRow(ERROR); valid row → Result + CourseBatch(PENDING).

---

## 7. Catalogue setup (before first upload)

1. **Admin → Academics → Faculties** – add faculties (e.g. FNS).
2. **Admin → Academics → Departments** – add departments (e.g. CSC under FNS).
3. **Admin → Academics → Courses** – add courses (code, title, credit_units, semester, level). Optional: set department.
4. **Admin → Users / Accounts** – import or add students (reg_number required for students).

After that, result upload and course-batch approval work as above.
