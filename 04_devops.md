# DevOps Engineer – Infrastruktur & Deployment PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** DevOps Engineer  
**Phase:** Phase 1 MVP

---

## 1. Hosting-Empfehlung

**AWS** als primäre Cloud-Plattform.

| Komponente | AWS Service | Begründung |
|-----------|------------|-----------|
| Kubernetes | EKS (Elastic Kubernetes Service) | Managed K8s, gut integriert mit AWS |
| Datenbank | RDS PostgreSQL (Multi-AZ) | Managed, automatische Backups, Failover |
| Cache/Queue | ElastiCache Redis | Managed Redis für BullMQ + Sessions |
| Object Storage | S3 | Reports, Screenshots, Artifacts |
| Container Registry | ECR (Elastic Container Registry) | Private Registry für Docker Images |
| DNS / CDN | Route53 + CloudFront | Domain Management, HTTPS, CDN für Frontend |
| Secrets | AWS Secrets Manager | Secrets sicher verwalten |
| Logs | CloudWatch Logs | Zentrales Log-Management |

**Warum nicht Azure/GCP:** AWS hat die reifste EKS-Integration und das breiteste Security-Tooling-Ecosystem.

---

## 2. Infrastruktur-Architektur

```
Internet
  │
  ▼
Route53 (DNS)
  │
  ├── app.ptaas.io → CloudFront → Next.js (Vercel oder K8s)
  └── api.ptaas.io → AWS ALB (Application Load Balancer)
                          │
                          ▼
                    EKS Cluster (ptaas-prod)
                    ├── Namespace: api
                    │   ├── Deployment: nest-api (2 Replicas)
                    │   ├── Service: nest-api-svc
                    │   └── HPA: 2-10 Replicas (CPU > 70%)
                    │
                    └── Namespace: scanners
                        └── Kubernetes Jobs (ephemer)
                            ├── web-security-worker
                            ├── ssl-tls-worker
                            └── port-scanner-worker

Managed Services (außerhalb K8s):
  ├── RDS PostgreSQL (Multi-AZ)
  ├── ElastiCache Redis (Cluster Mode)
  └── S3 Bucket (ptaas-reports)
```

---

## 3. Docker Setup

### docker-compose.yml (Entwicklung)

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ptaas
      POSTGRES_USER: ptaas
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build:
      context: ./apps/api
      target: development
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://ptaas:dev_password@postgres:5432/ptaas
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    volumes:
      - ./apps/api/src:/app/src
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: ./apps/web
      target: development
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    volumes:
      - ./apps/web/src:/app/src

volumes:
  postgres_data:
```

### Dockerfile API (Multi-stage)

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS development
RUN npm ci
COPY . .
CMD ["npm", "run", "start:dev"]

FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
```

### Dockerfile Scanner

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

FROM base AS production
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER nobody
CMD ["python", "-m", "workers.web_security.worker"]
```

---

## 4. Kubernetes Manifests (Phase 1)

### API Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nest-api
  namespace: ptaas-prod
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nest-api
  template:
    metadata:
      labels:
        app: nest-api
    spec:
      containers:
        - name: api
          image: ECR_REGISTRY/ptaas-api:latest
          ports:
            - containerPort: 3001
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          envFrom:
            - secretRef:
                name: ptaas-api-secrets
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 30
            periodSeconds: 30
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nest-api-hpa
  namespace: ptaas-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nest-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Scanner Job Template

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: scanner-web-{{ scanId }}
  namespace: scanners
spec:
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
      containers:
        - name: scanner
          image: ECR_REGISTRY/ptaas-scanner:latest
          resources:
            limits:
              cpu: "500m"
              memory: "512Mi"
          env:
            - name: SCAN_ID
              value: "{{ scanId }}"
            - name: INTERNAL_API_KEY
              valueFrom:
                secretKeyRef:
                  name: scanner-secrets
                  key: internal-api-key
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
```

---

## 5. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: ptaas_test
          POSTGRES_USER: ptaas
          POSTGRES_PASSWORD: test
        options: --health-cmd pg_isready
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:ci
      - run: npm run lint
      - run: npm run type-check

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

  build-and-push:
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1
      - name: Build and push API image
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker build -t $ECR_REGISTRY/ptaas-api:${{ github.sha }} ./apps/api
          docker push $ECR_REGISTRY/ptaas-api:${{ github.sha }}
      - name: Deploy to EKS
        run: |
          aws eks update-kubeconfig --name ptaas-prod --region eu-central-1
          kubectl set image deployment/nest-api api=$ECR_REGISTRY/ptaas-api:${{ github.sha }} -n ptaas-prod
          kubectl rollout status deployment/nest-api -n ptaas-prod
```

---

## 6. Monitoring & Logging

### Stack
| Tool | Zweck |
|------|-------|
| Prometheus | Metriken scrapen |
| Grafana | Dashboards + Alerting |
| OpenTelemetry | Distributed Tracing |
| Loki | Log-Aggregation |
| CloudWatch | AWS-Level Logs (Fallback) |
| PagerDuty / OpsGenie | Alerting (On-Call) |

### Key Dashboards (Phase 1)
1. **API Health** — Request Rate, Error Rate, Latenz (p50/p95/p99)
2. **Scan Queue** — Queue-Tiefe, Waiting Jobs, Failed Jobs
3. **Scanner Performance** — Scan-Dauer, Findings pro Scan
4. **Database** — Connection Pool, Query-Latenz, Replication Lag
5. **Infrastructure** — CPU, Memory, Pod-Status

### Alerts (kritisch)
| Alert | Schwellwert | Aktion |
|-------|------------|--------|
| API Error Rate | > 5% für 2 Min | PagerDuty P1 |
| Pod CrashLoop | 3x in 5 Min | PagerDuty P1 |
| Queue Stuck | Job > 10 Min wartend | Slack Warning |
| DB Connections | > 80% Pool | Slack Warning |
| Disk Usage | > 85% | PagerDuty P2 |

---

## 7. Backup & Disaster Recovery

| Ressource | Backup | RPO | RTO |
|-----------|--------|-----|-----|
| PostgreSQL (RDS) | Automatische Daily Backups + Point-in-Time | 1 Stunde | 2 Stunden |
| Redis (ElastiCache) | AOF Persistence | 15 Min | 30 Min |
| S3 Buckets | Versioning + Cross-Region Replication | 0 (versioniert) | Sofort |
| K8s Manifests | Git-Repository | 0 | 30 Min |
| Secrets | AWS Secrets Manager | 0 | 15 Min |

**Restore-Test:** Monatlich durchführen und dokumentieren.

---

## 8. Infrastruktur-Kosten (Schätzung Phase 1)

| Service | Konfiguration | Monatlich (ca.) |
|---------|--------------|----------------|
| EKS Cluster | 3x t3.medium Worker Nodes | ~200 € |
| RDS PostgreSQL | db.t3.medium, Multi-AZ, 100 GB | ~120 € |
| ElastiCache Redis | cache.t3.micro, 1 Node | ~25 € |
| S3 | 50 GB + Transfer | ~15 € |
| ECR | Container Registry | ~10 € |
| ALB | Application Load Balancer | ~20 € |
| CloudWatch | Logs + Metrics | ~30 € |
| Route53 + CloudFront | DNS + CDN | ~10 € |
| **Gesamt** | | **~430 € / Monat** |

**Phase 1 Budget-Empfehlung:** 500–600 € / Monat (inkl. Puffer).

---

## 9. Security im Betrieb

- **Container Image Scanning:** Trivy im CI (Pflicht, Block bei CRITICAL)
- **K8s Network Policies:** Scanner-Pods können nur API erreichen, kein Egress außer zu Scan-Targets
- **Secrets:** Nur via AWS Secrets Manager — niemals in Environment Variables direkt
- **IAM Roles:** Principle of Least Privilege — jeder Service bekommt nur die nötigsten AWS Permissions
- **VPC:** EKS, RDS, ElastiCache im privaten Subnet — kein direkter Internet-Zugang
- **WAF:** AWS WAF vor dem ALB — Rate Limiting, SQL Injection Protection
