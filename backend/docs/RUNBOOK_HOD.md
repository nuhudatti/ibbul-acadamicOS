# HOD Module Runbook

## Migrations
```bash
cd backend
python manage.py migrate
```

## Seed HOD Accounts
```bash
# Default: seeds hod.csc@ibbul.edu.ng → CSC, FNS
python manage.py seed_hod

# From CSV
python manage.py seed_hod --file=docs/hod_seed_example.csv

# From JSON
python manage.py seed_hod --file=docs/hod_seed_example.json

# Dry run (no changes)
python manage.py seed_hod --dry-run
```
Default temp password: `TempPass@Change1` (override with env `HOD_SEED_DEFAULT_PASSWORD`).

## SuperAdmin Webhook / Email
- Set in Django settings or env:
  - `AUDIT_FORWARDING_ENABLED=True`
  - `SUPERADMIN_WEBHOOK_URL=https://your-endpoint.example/audit`
  - `SUPERADMIN_EMAIL=admin@ibbul.edu.ng`
- Daily digest runs via Celery Beat (e.g. 6 AM). Ensure Celery worker and beat are running.

## Rotate Secrets
- Change `SECRET_KEY` in settings; restart app.
- JWT: adjust `SIMPLE_JWT` in settings and have clients re-login.
- Argon2: users rehash on next login if `argon2-cffi` is installed.

## Emergency Unlock (SuperAdmin Only)
1. Log in as SUPER_ADMIN (e.g. admin@ibbul.edu.ng).
2. POST `/api/academics/results/<id>/emergency_unlock/` with body: `{"reason": "Mandatory reason (e.g. Senate ref)"}`.
3. Result status becomes `HOD_REVIEW`; a `ResultVersion` and `EMERGENCY_UNLOCK` audit log are created.
4. Audit is forwarded to webhook/email if configured.

## Sample cURL (Upload + Approve)
```bash
# Login
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"hod.csc@ibbul.edu.ng","password":"Demo@123"}' | jq -r '.tokens.access')

# Validate upload
curl -X POST http://127.0.0.1:8000/api/academics/hod/upload/validate/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@results.csv" \
  -F "session=2023/2024" \
  -F "semester=FIRST"

# Approve result
curl -X POST "http://127.0.0.1:8000/api/academics/hod/results/1/approve/" \
  -H "Authorization: Bearer $TOKEN"
```

## Backups & Archive
- Audit logs: retain 7 years; archive older to object storage (gzip + index) per policy.
- DB: run regular backups; test restore.
