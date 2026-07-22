#!/usr/bin/env bash
set -euo pipefail

echo "==> BeautyBook deploy helper"
echo "1) Build images"
docker compose build

echo "2) Start stack"
docker compose up -d

echo "3) Wait for API health"
sleep 8
curl -sf http://localhost:3000/api/v1/health || echo "API aún arrancando — revisa logs: docker compose logs -f api"

echo "Listo. Web :80 / API :3000 / Swagger /api/docs"
