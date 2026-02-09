#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"

usage() {
  echo "Usage: $0 [frontend|backend|scheduler|all|db-migrate]"
  echo ""
  echo "  frontend    - Build frontend locally, copy dist into running container"
  echo "  backend     - Restart backend container (picks up volume-mounted code in dev mode)"
  echo "  scheduler   - Restart scheduler container"
  echo "  all         - Deploy frontend + restart backend + scheduler"
  echo "  db-migrate  - Run SQL migration on the live database"
  echo ""
  echo "Prerequisites: Start services with dev overlay first:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d"
  exit 1
}

deploy_frontend() {
  echo "==> Building frontend..."
  (cd "$FRONTEND_DIR" && npm run build)

  echo "==> Copying dist into gex_frontend container..."
  docker cp "$FRONTEND_DIR/dist/." gex_frontend:/usr/share/nginx/html/

  echo "==> Reloading nginx..."
  docker exec gex_frontend nginx -s reload

  echo "==> Frontend deployed."
}

restart_backend() {
  echo "==> Restarting backend..."
  docker restart gex_backend
  echo "==> Backend restarted."
}

restart_scheduler() {
  echo "==> Restarting scheduler..."
  docker restart gex_scheduler
  echo "==> Scheduler restarted."
}

db_migrate() {
  echo "==> Running DB migration..."
  docker exec -i gex_db psql -U gex_user -d gex_db < "$PROJECT_DIR/database/init.sql"
  echo "==> DB migration complete."
}

if [ $# -eq 0 ]; then
  usage
fi

case "$1" in
  frontend)
    deploy_frontend
    ;;
  backend)
    restart_backend
    ;;
  scheduler)
    restart_scheduler
    ;;
  all)
    deploy_frontend
    restart_backend
    restart_scheduler
    ;;
  db-migrate)
    db_migrate
    ;;
  *)
    usage
    ;;
esac
