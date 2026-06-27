#!/usr/bin/env bash
# Render build script — install deps and collect static files
set -o errexit

echo "Using Python: $(python --version)"

PY_MAJOR=$(python -c 'import sys; print(sys.version_info.major)')
PY_MINOR=$(python -c 'import sys; print(sys.version_info.minor)')

if [ "$PY_MAJOR" != "3" ] || [ "$PY_MINOR" != "12" ]; then
  echo "ERROR: This project requires Python 3.12.x on Render."
  echo "Render is using $(python --version) — psycopg2 will fail on 3.14."
  echo "Fix: In Render Dashboard → Environment → add PYTHON_VERSION=3.12.10"
  echo "Or commit backend/.python-version (already included in this repo)."
  exit 1
fi

pip install -r requirements.txt
python manage.py collectstatic --noinput
