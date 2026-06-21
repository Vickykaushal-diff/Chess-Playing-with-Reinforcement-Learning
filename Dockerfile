FROM python:3.11-slim

# Install system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements
COPY requirements.txt .
COPY web_app/requirements_web.txt web_app/

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir -r web_app/requirements_web.txt

# Copy source code
COPY . .

# Expose port (FastAPI will listen here)
EXPOSE 8000

# Run FastAPI app
CMD ["python", "-m", "uvicorn", "main:app", "--app-dir", "web_app", "--host", "0.0.0.0", "--port", "8000"]
