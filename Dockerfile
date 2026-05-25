# Stage 1: build React SPA
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: runtime
FROM cm2network/steamcmd:latest AS runtime
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv git \
    && rm -rf /var/lib/apt/lists/*

# Python deps
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ .

# Built frontend
COPY --from=frontend-builder /app/frontend/dist /app/backend/static

# Entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Pre-create /palworld so Docker named-volume init preserves steam ownership
RUN mkdir -p /palworld && chown -R steam:steam /app /palworld
USER steam

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
