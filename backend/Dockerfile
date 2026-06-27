# Production-grade Dockerfile for IBBUL Result Management System
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install additional dependencies for Module 7 & 8
RUN pip install --no-cache-dir \
    argon2-cffi \
    boto3 \
    flower

# Copy application code
COPY . .

# Collect static files (if needed)
# RUN python manage.py collectstatic --noinput

# Expose port
EXPOSE 8000

# Default command (override in docker-compose.yml)
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
