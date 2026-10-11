# PTaaS — Lokale Installation (Step-by-Step)

## Überblick: Was läuft wo?

| Dienst | Technologie | Port | Start |
|--------|-------------|------|-------|
| **PostgreSQL** (+ pgvector) | Docker | 5432 | `docker compose up` |
| **Redis** | Docker | 6379 | `docker compose up` |
| **MinIO** (S3-kompatibler Storage) | Docker | 9000 / 9001 | `docker compose up` |
| **API** (NestJS) | Node.js lokal | 3001 | `npm run dev -w apps/api` |
| **Web** (Next.js) | Node.js lokal | 3000 | `npm run dev -w apps/web` |
| **Scanner** (Python Worker) | Python lokal | — | `python -m worker` |
| **ZAP** (optional) | Docker | 8080 | `docker compose up zap` |

> **Strategie:** Infrastruktur (Datenbank, Redis, MinIO) läuft in Docker.  
> App-Code (API, Web, Scanner) läuft lokal — dadurch Hot-Reload und einfaches Debuggen.

---

## Voraussetzungen

### 1. Software installieren

| Tool | Mindestversion | Download |
|------|---------------|----------|
| **Node.js** | 20.x LTS | https://nodejs.org |
| **npm** | 10.x | kommt mit Node.js |
| **Docker Desktop** | aktuell | https://www.docker.com/products/docker-desktop |
| **Python** | 3.11+ | https://www.python.org/downloads |
| **Git** | aktuell | https://git-scm.com |

Prüfen ob alles installiert ist:
```powershell
node --version      # v20.x.x
npm --version       # 10.x.x
docker --version    # Docker version 27.x
python --version    # Python 3.11.x
git --version       # git version 2.x
```

### 2. Repository klonen (falls noch nicht geschehen)

```powershell
git clone <dein-repo-url> C:\Projects\PTaaS\PTaaS
cd C:\Projects\PTaaS\PTaaS
```

---

## Schritt 1 — Umgebungsvariablen einrichten

Im Projektroot liegt `.env.example`. Kopiere es:

```powershell
Copy-Item .env.example .env
```

Öffne `.env` und passe folgende Werte an:

```env
# ── Datenbank ─────────────────────────────────────────────────
DATABASE_URL="postgresql://ptaas:ptaas_password@localhost:5432/ptaas_db?schema=public"

# ── Redis ─────────────────────────────────────────────────────
REDIS_URL="redis://localhost:6379"

# ── MinIO ─────────────────────────────────────────────────────
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="ptaas_minio"
MINIO_SECRET_KEY="ptaas_minio_secret"
MINIO_BUCKET_EVIDENCE="ptaas-evidence"
MINIO_BUCKET_REPORTS="ptaas-reports"

# ── API ───────────────────────────────────────────────────────
API_PORT="3001"
NODE_ENV="development"

# ── Auth — WICHTIG: echte Werte generieren! ───────────────────
JWT_ACCESS_SECRET="mein_geheimer_jwt_access_schluessel_32chars"
JWT_REFRESH_SECRET="mein_geheimer_jwt_refresh_schluessel_32chars"
ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"

# ── Scanner ───────────────────────────────────────────────────
SCANNER_API_KEY="mein_scanner_api_key_mindestens_32_zeichen!!"

# ── Frontend ──────────────────────────────────────────────────
NEXT_PUBLIC_API_URL="http://localhost:3001"

# ── Claude AI (optional für AI-Features) ──────────────────────
ANTHROPIC_API_KEY="sk-ant-..."
```

**Sichere Zufallswerte generieren (PowerShell):**
```powershell
# JWT Secrets (je einen für ACCESS und REFRESH)
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# ENCRYPTION_KEY (64 Hex-Zeichen = 32 Bytes)
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# SCANNER_API_KEY
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

---

## Schritt 2 — Secret-Dateien anlegen

Der Docker Compose erwartet zwei Secret-Dateien:

```powershell
# Ordner anlegen
New-Item -ItemType Directory -Force secrets

# scanner_api_key — gleicher Wert wie SCANNER_API_KEY in .env
"mein_scanner_api_key_mindestens_32_zeichen!!" | Out-File -Encoding ascii -NoNewline secrets\scanner_api_key.txt

# encryption_key — gleicher Wert wie ENCRYPTION_KEY in .env (Hex)
"0000000000000000000000000000000000000000000000000000000000000000" | Out-File -Encoding ascii -NoNewline secrets\encryption_key.txt
```

---

## Schritt 3 — Infrastruktur starten (Docker)

Nur Infrastruktur starten (kein API, kein Web, kein Scanner aus Docker):

```powershell
docker compose up postgres redis minio -d
```

Warten bis alle drei healthy sind:
```powershell
docker compose ps
```

Erwartete Ausgabe:
```
NAME              STATUS
ptaas-postgres    running (healthy)
ptaas-redis       running (healthy)
ptaas-minio       running (healthy)
```

**MinIO Buckets einmalig erstellen:**

MinIO startet leer — die zwei Buckets müssen einmalig angelegt werden.  
Öffne im Browser: **http://localhost:9001**

- Login: `ptaas_minio` / `ptaas_minio_secret`
- Links auf **Buckets** → **Create Bucket**
- Bucket 1: `ptaas-evidence`
- Bucket 2: `ptaas-reports`

Alternativ per CLI (wenn mc installiert):
```powershell
mc alias set local http://localhost:9000 ptaas_minio ptaas_minio_secret
mc mb local/ptaas-evidence
mc mb local/ptaas-reports
```

---

## Schritt 4 — Node.js Dependencies installieren

```powershell
# Im Projektroot (installiert alle Workspaces: api, web, packages/*)
npm install
```

Das installiert alle Abhängigkeiten für `apps/api`, `apps/web`, `packages/db` und `packages/types` in einem Schritt.

---

## Schritt 5 — Datenbank-Schema einrichten (Prisma)

```powershell
# Prisma Client generieren
npm run db:generate

# Alle Migrationen auf die Datenbank anwenden
npm run db:migrate
```

> Falls du eine frische Datenbank hast, werden alle Tabellen neu angelegt.  
> Falls Migrationen noch nie liefen, kann es 30–60 Sekunden dauern.

**Prisma Studio (optional) — visuelle DB-Ansicht:**
```powershell
npm run db:studio
# Öffnet http://localhost:5555
```

---

## Schritt 6 — API starten

In einem neuen Terminal-Fenster:

```powershell
cd C:\Projects\PTaaS\PTaaS
npm run dev --workspace=apps/api
```

Die API liest `.env` automatisch. Warte auf:
```
[NestApplication] Nest application successfully started
[Bootstrap] 🚀 API running on http://localhost:3001
```

**Swagger UI verfügbar unter:** http://localhost:3001/api/docs

---

## Schritt 7 — Web-Frontend starten

In einem weiteren Terminal-Fenster:

```powershell
cd C:\Projects\PTaaS\PTaaS
npm run dev --workspace=apps/web
```

Warte auf:
```
▲ Next.js 15.x.x
- Local: http://localhost:3000
✓ Ready in Xs
```

**App erreichbar unter:** http://localhost:3000

---

## Schritt 8 — Scanner Worker starten (Python)

Der Scanner-Worker verarbeitet Scan-Jobs aus der Redis-Queue.

### Python Virtual Environment einrichten

```powershell
cd C:\Projects\PTaaS\PTaaS\apps\scanner

# Virtual Environment erstellen
python -m venv .venv

# Aktivieren (PowerShell)
.\.venv\Scripts\Activate.ps1

# Falls Fehler wegen Execution Policy:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Dependencies installieren
pip install -r requirements.txt
```

### Scanner-Umgebungsvariablen

Der Scanner liest zusätzliche Werte aus der `.env` im Root. Kopiere sie in den Scanner-Ordner oder setze sie als Umgebungsvariablen:

```powershell
# Umgebungsvariablen für diese Session setzen
$env:REDIS_URL = "redis://localhost:6379"
$env:API_BASE_URL = "http://localhost:3001/api/v1"
$env:SCANNER_API_KEY = "mein_scanner_api_key_mindestens_32_zeichen!!"
$env:ENCRYPTION_KEY = "0000000000000000000000000000000000000000000000000000000000000000"
```

### Scanner starten

```powershell
# Noch im apps/scanner Ordner mit aktivierter venv
python -m worker
```

Erwartete Ausgabe:
```
[scanner] Worker started — listening for jobs on queue: scanner
[scanner] Connected to Redis at redis://localhost:6379
```

> **Nuclei muss separat installiert sein** damit echte Scans laufen.  
> Ohne Nuclei startet der Worker trotzdem — Scan-Jobs schlagen dann mit einem klaren Fehler fehl.

---

## Schritt 9 (Optional) — Nuclei installieren

Nuclei ist der Open-Source-Vulnerability-Scanner, den der Python-Worker aufruft.

**Windows:**
```powershell
# Mit Scoop (empfohlen)
scoop install nuclei

# Oder direkter Download von:
# https://github.com/projectdiscovery/nuclei/releases
# nuclei.exe in PATH legen (z.B. C:\Windows\System32\)

# Prüfen
nuclei --version
```

**Templates herunterladen (einmalig, ~500 MB):**
```powershell
nuclei -update-templates
```

---

## Schritt 10 (Optional) — OWASP ZAP starten

ZAP wird für Web-Crawl und API-Scans benötigt.

```powershell
docker compose up zap -d
```

ZAP braucht 30–60 Sekunden zum Starten. Status prüfen:
```powershell
docker compose ps zap
# Warte auf: running (healthy)
```

ZAP API erreichbar unter: http://localhost:8080

---

## Erster Start — Konto anlegen

1. Öffne **http://localhost:3000**
2. Klicke **"Create one"** (Register)
3. Fülle das Formular aus: Name, E-Mail, Organisations-Name
4. Du siehst den "Bestätige deine E-Mail"-Screen — in der Entwicklungsumgebung kommt keine echte Mail; klicke direkt **"E-Mail bestätigt — MFA einrichten →"**
5. Scanne den QR-Code mit einer Authenticator-App (z.B. Google Authenticator, Authy)
6. Gib den 6-stelligen Code ein
7. Onboarding durchlaufen: Workspace-Name, Branche, erstes Projekt anlegen

---

## Alle Services auf einen Blick

| URL | Was |
|-----|-----|
| http://localhost:3000 | Web-App (Next.js) |
| http://localhost:3001 | API (NestJS) |
| http://localhost:3001/api/docs | Swagger UI |
| http://localhost:5432 | PostgreSQL |
| http://localhost:6379 | Redis |
| http://localhost:9000 | MinIO S3 API |
| http://localhost:9001 | MinIO Web-Console |
| http://localhost:5555 | Prisma Studio (wenn gestartet) |
| http://localhost:8080 | ZAP API (wenn gestartet) |

---

## Fehlersuche

### PostgreSQL startet nicht
```powershell
# Logs prüfen
docker compose logs postgres

# Port bereits belegt?
netstat -ano | findstr :5432
# Prozess mit dieser PID beenden oder .env PORT ändern
```

### `npm run db:migrate` schlägt fehl
```powershell
# Datenbankverbindung testen
docker compose exec postgres psql -U ptaas -d ptaas_db -c "SELECT 1;"
# Muss "1" zurückgeben

# Umgebungsvariable prüfen
echo $env:DATABASE_URL
# Falls leer: .env liegt nicht im Root oder Pfad stimmt nicht
```

### API startet nicht — "Cannot connect to Redis"
```powershell
docker compose ps redis          # Muss healthy sein
docker compose logs redis        # Fehlerdetails
# Redis manuell testen:
docker compose exec redis redis-cli ping  # Muss PONG zurückgeben
```

### MinIO-Fehler beim Upload
- Prüfen ob Buckets existieren: http://localhost:9001 → Buckets
- `ptaas-evidence` und `ptaas-reports` müssen vorhanden sein (Schritt 3)

### Scanner kann Nuclei nicht finden
```powershell
where.exe nuclei   # Muss Pfad zurückgeben
nuclei --version   # Muss Version zeigen
# Falls nicht: Nuclei neu installieren, PATH prüfen
```

### Python venv Activation schlägt fehl (Windows)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
# Dann erneut: .\.venv\Scripts\Activate.ps1
```

---

## Alles stoppen

```powershell
# Docker-Infrastruktur stoppen (Daten bleiben erhalten)
docker compose stop postgres redis minio

# Oder komplett entfernen inkl. Volumes (Daten weg!)
docker compose down -v
```

Node.js und Python Prozesse: einfach `Ctrl+C` in den jeweiligen Terminals.

---

## Kurzreferenz — Täglicher Start

```powershell
# Terminal 1 — Infrastruktur
cd C:\Projects\PTaaS\PTaaS
docker compose up postgres redis minio -d

# Terminal 2 — API
cd C:\Projects\PTaaS\PTaaS
npm run dev --workspace=apps/api

# Terminal 3 — Web
cd C:\Projects\PTaaS\PTaaS
npm run dev --workspace=apps/web

# Terminal 4 — Scanner (optional)
cd C:\Projects\PTaaS\PTaaS\apps\scanner
.\.venv\Scripts\Activate.ps1
$env:REDIS_URL = "redis://localhost:6379"
$env:API_BASE_URL = "http://localhost:3001/api/v1"
$env:SCANNER_API_KEY = "mein_scanner_api_key_mindestens_32_zeichen!!"
python -m worker
```
