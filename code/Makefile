# PTaaS Platform – Entwicklungs-Befehle
# Verwendung: make <befehl>

COMPOSE = docker compose -f infra/docker-compose.yml
COMPOSE_RUN = $(COMPOSE) run --rm

.PHONY: help up down restart logs build clean \
        db-push db-studio seed \
        api-logs web-logs scanner-logs \
        test test-api test-scanner lint

# ── Hilfe ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  PTaaS Platform – Make-Befehle"
	@echo "  ─────────────────────────────────────────────────"
	@echo "  make up            Alle Services starten"
	@echo "  make down          Alle Services stoppen"
	@echo "  make restart       Neustart aller Services"
	@echo "  make build         Docker-Images neu bauen"
	@echo "  make logs          Logs aller Services (live)"
	@echo "  make api-logs      Nur API-Logs"
	@echo "  make web-logs      Nur Web-Logs"
	@echo "  make scanner-logs  Nur Scanner-Logs"
	@echo ""
	@echo "  make db-push       Prisma Schema pushen"
	@echo "  make db-studio     Prisma Studio öffnen"
	@echo "  make seed          Datenbank mit Testdaten befüllen"
	@echo ""
	@echo "  make test          Alle Tests ausführen"
	@echo "  make test-api      NestJS Unit-Tests"
	@echo "  make test-scanner  Python-Tests"
	@echo "  make lint          Linting (API + Web)"
	@echo "  make clean         Alle Container + Volumes löschen"
	@echo ""

# ── Services ──────────────────────────────────────────────────────────────────
up:
	$(COMPOSE) up -d
	@echo ""
	@echo "  ✓ Services gestartet:"
	@echo "    Web:        http://localhost:3000"
	@echo "    API:        http://localhost:3001"
	@echo "    Bull Board: http://localhost:3002"
	@echo "    Postgres:   localhost:5432"
	@echo "    Redis:      localhost:6379"
	@echo ""

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

build:
	$(COMPOSE) build --no-cache

logs:
	$(COMPOSE) logs -f

api-logs:
	$(COMPOSE) logs -f api

web-logs:
	$(COMPOSE) logs -f web

scanner-logs:
	$(COMPOSE) logs -f scanner

# ── Datenbank ─────────────────────────────────────────────────────────────────
db-push:
	$(COMPOSE_RUN) migrate sh -c "npx prisma db push"

db-studio:
	cd apps/api && npx prisma studio

seed:
	$(COMPOSE_RUN) migrate sh -c "npx prisma db seed"

# ── Tests ─────────────────────────────────────────────────────────────────────
test: test-api test-scanner

test-api:
	cd apps/api && npm test

test-scanner:
	cd apps/scanner && python -m pytest

lint:
	cd apps/api && npm run lint
	cd apps/web && npm run lint

# ── Aufräumen ─────────────────────────────────────────────────────────────────
clean:
	$(COMPOSE) down -v --remove-orphans
	@echo "Alle Container und Volumes gelöscht."
