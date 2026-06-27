# What Next — IBBUL Result Management System

After completing the HOD module, here are **prioritized next steps**.

---

## 1. **Testing & QA (Module 10)** — High value

- **Unit tests**
  - HOD: upload validation, state transitions (approve/reject/unlock), RBAC (HOD vs SUPER_ADMIN).
  - Audit forwarding (webhook/email), seed_hod command.
- **Integration tests**
  - HOD flow: login → upload → validate → submit → approve → lock.
  - Emergency unlock (SUPER_ADMIN only, reason required).
- **E2E (Cypress/Playwright)**
  - HOD: upload → preview → submit → approve; Users create/edit; Audit view.
- **Load test**
  - 50k-row upload (throughput, no OOM); document script and results.

**Commands to add:** `pytest` / `python manage.py test`, optional `playwright test`.

---

## 2. **HOD Analytics backend** — Medium

- **GET `/api/academics/hod/analytics/`** (or under hod router).
  - Grade distribution per course (department-scoped).
  - Department GPA trends (session/semester).
- Wire **HODAnalytics.tsx** to this API instead of mock data.

---

## 3. **Deployment & docs (Module 11)**

- **Docker**
  - Dockerfile (web), docker-compose (web + redis + celery worker + beat + optional flower/minio).
  - Production env vars (SECRET_KEY, DB, CELERY_BROKER_URL, SUPERADMIN_WEBHOOK_URL).
- **Docs**
  - README: setup, run migrations, seed_demo/seed_hod, run Celery, login credentials.
  - Backup & retention runbook (DB, audit logs, 7-year retention, archive to object storage).
- **CI (optional)**
  - GitHub Actions: lint, test, coverage gate (e.g. fail if &lt;80%).

---

## 4. **Polish & production hardening**

- **Security**
  - Rate limiting on login/forgot-password (if not already).
  - OWASP-oriented check on HOD and SuperAdmin endpoints.
- **Exports**
  - Ensure all exports use single-use signed URLs with TTL and are logged (audit).
- **Monitoring**
  - Use existing `/health` and `/metrics` in alerting; document runbook for incidents.

---

## 5. **Optional enhancements**

- **workflow.py**
  - Shared helpers: `validate_transition(current, new, role)`, `create_version_on_lock(result)`.
- **E2E for SuperAdmin**
  - Emergency unlock flow (login as admin → unlock with reason → verify status).
- **Postman**
  - Add a “Tests” script to login and save `access_token` to collection variable for other requests.

---

## Suggested order

| Order | Focus              | Outcome                    |
|-------|--------------------|----------------------------|
| 1     | Testing (unit + integration) | Confidence before deploy   |
| 2     | HOD Analytics API  | Full HOD feature set       |
| 3     | Deployment + README| Run in staging/production  |
| 4     | E2E + load test    | QA and performance baseline|
| 5     | CI + polish        | Automated checks, hardening|

---

## Quick commands (current system)

```bash
# Backend
cd backend
python manage.py migrate
python manage.py seed_demo
python manage.py seed_hod
python manage.py runserver

# Frontend
cd frontend && npm run dev

# Celery (optional)
celery -A config worker -l info
celery -A config beat -l info
```

**Logins (password `Demo@123`):**  
SUPER_ADMIN: `admin@ibbul.edu.ng` · HOD: `hod.csc@ibbul.edu.ng` · EXAMINER: `lecturer1@ibbul.edu.ng` · STUDENT: `U22/FNS/CSC/0001`
