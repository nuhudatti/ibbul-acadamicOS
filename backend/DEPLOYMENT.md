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

## Part 5 — Production checklist

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
