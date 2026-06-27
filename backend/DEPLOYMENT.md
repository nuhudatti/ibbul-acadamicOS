# Production Deployment Guide — IBBUL Academic OS

This guide covers PostgreSQL (Neon), Cloudinary media, and the one-time Enterprise Setup Wizard.

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Neon PostgreSQL account (or any PostgreSQL provider)
- Cloudinary account
- SMTP (SendGrid, university mail, etc.)

---

## Part 1 — PostgreSQL (Neon)

### 1. Create Neon database

1. Sign in at [https://neon.tech](https://neon.tech)
2. Create a project → copy the **connection string**
3. It looks like:
   ```
   postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Configure backend `.env`

```env
DEBUG=False
SECRET_KEY=<generate-with-openssl-rand-hex-32>
ALLOWED_HOSTS=your-api-domain.com
CSRF_TRUSTED_ORIGINS=https://your-frontend-domain.com
DATABASE_URL=postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require
FRONTEND_BASE_URL=https://your-frontend-domain.com
```

**Important:** When `DEBUG=False`, `DATABASE_URL` is **required**. SQLite is not used in production.

### 3. Run migrations

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
```

### 4. Migrate existing SQLite data (optional)

If you have data in `db.sqlite3`:

```bash
# Export from SQLite (with old .env without DATABASE_URL)
python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission > backup.json

# Switch .env to DATABASE_URL (Neon), then:
python manage.py migrate
python manage.py loaddata backup.json
```

---

## Part 2 — Cloudinary media

### 1. Cloudinary dashboard

Create a Cloudinary account → Dashboard → copy:

- Cloud name
- API Key
- API Secret

### 2. Add to `.env`

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_BRANDING_FOLDER=ibbul/branding
CLOUDINARY_LEARNING_FOLDER=ibbul/learning
MEDIA_USE_CLOUDINARY=True
```

### 3. Migrate existing media

After Cloudinary is configured:

```bash
python manage.py migrate_media_to_cloudinary
```

This uploads:

- Branding logo / background / banner (from base64 in DB → Cloudinary URLs)
- Local lesson video/PDF files → Cloudinary URLs

**Going forward:** All branding uploads and lesson media use Cloudinary URLs only — nothing stored in the database as base64 or on the server disk for user media.

Result CSV upload batches still use temporary local storage for processing only (not served as public media).

---

## Part 3 — Enterprise Setup Wizard

### First run (fresh database)

1. Deploy backend + frontend
2. Run `python manage.py migrate`
3. Open the frontend → automatically redirects to **`/setup`**
4. Complete the wizard:
   - Institution name & platform identity
   - Super Admin email + password
5. Wizard **permanently disables** once a Super Admin exists
6. Sign in at `/login` — use **Forgot password** anytime (requires SMTP)

### Demo accounts

`admin@ibbul.edu.ng` / `Demo@123` **do not exist** on a fresh database.

Do **not** run `seed_demo_users` in production unless you explicitly want demo data.

### Emergency CLI (after setup)

```bash
python manage.py ensure_superadmin --email ict@ibbul.edu.ng --password "SecurePass123!" --force
```

---

## Part 4 — Frontend

```env
# platform/.env.local
NEXT_PUBLIC_API_URL=https://your-api-domain.com
```

```bash
cd platform
npm install
npm run build
npm start
```

---

## Part 5 — Render deployment

> **Important:** Render does **not** read `runtime.txt`. New services default to **Python 3.14**, which breaks `psycopg2`. You must pin **3.12.10** using one of:
> 1. **Recommended:** Environment variable `PYTHON_VERSION=3.12.10` in Render dashboard
> 2. Commit `backend/.python-version` containing `3.12.10` (included in this repo)

### 1. Create Web Service

| Setting | Value |
|---------|--------|
| **Root Directory** | `backend` |
| **Runtime** | Python 3 |
| **Build Command** | `./build.sh` |
| **Start Command** | `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120` |

Or use the included `render.yaml` Blueprint at the repo root.

### 2. Environment variables (Render dashboard)

```env
PYTHON_VERSION=3.12.10
DEBUG=False
SECRET_KEY=<openssl-rand-hex-32>
ALLOWED_HOSTS=your-service.onrender.com
CSRF_TRUSTED_ORIGINS=https://your-frontend-domain.com
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com
DATABASE_URL=postgresql://user:pass@ep-xxxx.neon.tech/neondb?sslmode=require
FRONTEND_BASE_URL=https://your-frontend-domain.com

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
MEDIA_USE_CLOUDINARY=True

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=apikey
EMAIL_HOST_PASSWORD=<sendgrid-api-key>
DEFAULT_FROM_EMAIL=IBBUL Academic OS <noreply@ibbul.edu.ng>
```

### 3. Post-deploy

```bash
# Run once via Render Shell or as a one-off job:
python manage.py migrate
python manage.py setup_groups
```

Then open the frontend → complete `/setup` wizard.

### 4. Logs

All logs go to **stdout** (Render Logs tab). No `backend/logs/django.log` file is used.

---

## Part 6 — Production checklist

| Step | Command / action |
|------|------------------|
| PostgreSQL | Set `DATABASE_URL` in `.env` |
| Migrate | `python manage.py migrate` |
| Cloudinary | Set `CLOUDINARY_*` in `.env` |
| Media migration | `python manage.py migrate_media_to_cloudinary` |
| SMTP | Configure `EMAIL_*` for invitations & password reset |
| Setup wizard | Visit `/setup` once → create Super Admin |
| Security | `DEBUG=False`, strong `SECRET_KEY`, HTTPS |
| Groups | `python manage.py setup_groups` (after first login) |

---

## Health check

```bash
curl https://your-api-domain.com/health
```

Setup status (public):

```bash
curl https://your-api-domain.com/api/core/setup/status/
# { "setup_required": false, "setup_complete": true, "database_ok": true, ... }
```

---

## Architecture notes

- **All modules preserved** — Results, Learning, Invitations, Audit, Branding, etc. unchanged at the schema level
- **Branding fields** (`logo_data`, etc.) now store **HTTPS Cloudinary URLs** instead of base64
- **Lesson `file_key`** stores Cloudinary URL for video/PDF
- **Backward compatible** — legacy local paths still resolve until migrated
