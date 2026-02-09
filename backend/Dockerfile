FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for psycopg2 and curl
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    libfreetype6-dev \
    libpng-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default command 
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
