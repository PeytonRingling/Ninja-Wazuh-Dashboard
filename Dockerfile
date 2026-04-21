# ── Stage 1: Build the React frontend ────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


# ── Stage 2: Python runtime + pre-built frontend ──────────────────────────────
FROM python:3.12-slim

WORKDIR /app/backend

# Install Python deps
COPY requirements.txt ../
RUN pip install --no-cache-dir -r ../requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend to /app/frontend/dist (where main.py looks for it)
COPY --from=frontend-build /frontend/dist ../frontend/dist

# /data is where the SQLite database lives in production (mounted as a volume)
RUN mkdir -p /data

# Run as non-root
RUN useradd -r -u 1001 appuser && chown -R appuser /app /data
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
