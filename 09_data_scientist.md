# Data Scientist – Daten & KI PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** Data Scientist  
**Phase:** Phase 1 (Datenfundament) → Phase 2/3 (KI-Features)

---

## 1. Datenstrategie

### Prinzip: "Jetzt sammeln, später lernen"

Phase 1 produziert keine KI-Features, aber legt das Datenfundament für Phase 2/3. Jeder Scan, jedes Finding, jede Nutzer-Interaktion ist ein Datenpunkt für spätere Modelle.

**Kritisch: Schlechte Datenqualität in Phase 1 = kaputte KI in Phase 2.**

---

## 2. Welche Daten werden erzeugt?

### Primäre Daten (direkt aus Scan-Prozess)

| Datentyp | Volume (geschätzt) | Format | Speicherung |
|---------|------------------|--------|-------------|
| Findings (Schwachstellen) | 10-100 / Scan | Structured (DB) | PostgreSQL |
| Scan-Rohantworten (HTTP Headers, Response Bodies) | 1-10 MB / Scan | JSON | S3 |
| SSL-Zertifikat-Daten | < 1 KB / Ziel | JSON | PostgreSQL |
| Port-Scan-Ergebnisse | < 10 KB / Ziel | JSON | PostgreSQL |
| Scanner-Logs (strukturiert) | 1-5 MB / Scan | JSON (structlog) | CloudWatch / S3 |

### Sekundäre Daten (aus Nutzer-Interaktion)

| Datentyp | Bedeutung |
|---------|-----------|
| False-Positive-Markierungen | Gold-Labels für FP-Klassifikator |
| Finding-Status-Änderungen (Fixed, Won't Fix) | Remediation-Patterns |
| Report-Downloads | Relevanz-Signal |
| Scan-Konfigurationen | Welche Scans werden bevorzugt? |
| Audit-Log-Events | Nutzerverhalten |

---

## 3. Datenmodell für KI-Features (Phase 2/3)

### Findings als ML-Features

```python
# Jedes Finding enthält (oder sollte enthalten):
{
    "title": "Missing Strict-Transport-Security Header",
    "severity": "HIGH",
    "cvss_score": 7.5,
    "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
    "cwe_id": "CWE-319",
    "owasp_category": "A05:2021 – Security Misconfiguration",
    "affected_url": "https://example.com",
    "affected_component": "HTTP Response Headers",
    "proof_of_concept": "curl -I https://example.com | grep -i strict",
    "remediation": "Add header: Strict-Transport-Security: max-age=31536000",
    
    # KI-relevante Zusatzfelder (ab Phase 1 speichern):
    "raw_check_output": { ... },  # Rohdaten für FP-Analyse
    "check_version": "1.0.0",    # Welche Version des Checks
    "target_tech_stack": ["nginx", "php"],  # Erkannte Technologien
    "false_positive": false,      # User-Label
    "status": "FIXED"             # Remediation-Label
}
```

### Datenqualitäts-Anforderungen (Pflicht Phase 1)

- [ ] `null`-Felder dokumentiert und minimiert
- [ ] Severity-Labels konsistent (CRITICAL/HIGH/MEDIUM/LOW/INFO)
- [ ] CVSS-Score immer berechnet (nicht optional)
- [ ] CWE-ID immer gesetzt (mindestens auf Kategorie-Ebene)
- [ ] OWASP-Kategorie immer gesetzt
- [ ] `raw_check_output` als JSON in S3 gespeichert (für spätere Analyse)
- [ ] Scanner-Version versioniert (für Model-Drift-Erkennung)

---

## 4. KI/ML-Potenzial (nach Phasen)

### Phase 2 — Quick Wins (sofort umsetzbar)

#### 4.1 AI Finding Explanation (Claude API)

```python
# Finding → Natürlichsprachliche Erklärung
import anthropic

client = anthropic.Anthropic()

def explain_finding(finding: dict) -> str:
    prompt = f"""
    Du bist ein Security-Experte. Erkläre diese Schwachstelle einem Entwickler:
    
    Titel: {finding['title']}
    Schweregrad: {finding['severity']} (CVSS: {finding['cvss_score']})
    Betroffene URL: {finding['affected_url']}
    CWE: {finding['cwe_id']}
    
    Erkläre:
    1. Was ist das Problem?
    2. Welches Risiko besteht konkret?
    3. Wie kann es ausgenutzt werden?
    4. Wie behebe ich es (konkret für diese URL)?
    
    Antworte in max. 200 Wörtern, technisch aber verständlich.
    """
    
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text
```

#### 4.2 AI Risk Prioritization

```python
# Mehrere Findings → Prioritisierte Liste mit Kontext
def prioritize_findings(findings: list[dict], context: dict) -> list[dict]:
    """
    Context: { industry, company_size, data_types, tech_stack }
    Prioritisierung über CVSS + Kontext + Exploitability
    """
    prompt = f"""
    Priorisiere diese {len(findings)} Security-Findings für ein Unternehmen:
    Kontext: {context}
    
    Findings: {json.dumps(findings, indent=2)}
    
    Antworte mit JSON: [{{ "id": "...", "priority": 1, "reasoning": "..." }}]
    Priorisiere nach: Ausnutzbarkeit × Schadenpotenzial × Kontext-Relevanz
    """
    # ... Claude API Call
```

### Phase 3 — ML-Modelle (eigenes Training)

#### 4.3 False Positive Klassifikator

**Ziel:** Automatisch FPs herausfiltern, bevor sie dem Nutzer gezeigt werden.

```
Trainingsdata:
  Input:  Finding (Features: title, check_type, target_response, 
                   url_pattern, http_status, raw_output)
  Label:  false_positive (Boolean) — aus Nutzer-Markierungen

Modell:  XGBoost (einfach zu trainieren, gut erklärbar)
  oder   Fine-tuned Classifier auf Embedding-Basis (SBERT)

Ziel:    Precision > 95% (keine echten Vulns als FP markieren!)
         Recall > 70% (mindestens 70% der FPs herausfiltern)

Training: Ab 500 gelabelten Findings möglich
          Ab 5.000 Findings robustes Modell
```

#### 4.4 Vulnerability Pattern Detection

```
Ziel: Erkennung von Vulnerability-Mustern über Targets hinweg
      "Alle Subdomains von example.com haben dasselbe CORS-Problem"
      
Input: Findings-Graph (Asset → Finding → Tech-Stack)
Modell: Graph Neural Network (GNN) oder einfacher Clustering-Ansatz
```

---

## 5. Analyse- und Reporting-Anforderungen

### Phase 1 — Basis-Analytics

| Metrik | Berechnung | Nutzen |
|--------|-----------|--------|
| Severity Distribution | COUNT FINDINGS GROUP BY severity | Risiko-Übersicht |
| Scan Success Rate | completed / total scans | Plattform-Qualität |
| False Positive Rate | marked_fp / total findings | Scanner-Qualität |
| MTTF (Mean Time To Fix) | AVG(fixed_at - created_at) | Remediation-Geschwindigkeit |
| Findings per Scan | AVG(COUNT findings) per scan | Scanner-Effektivität |
| Top CWE Categories | COUNT GROUP BY cwe_id | Trend-Analyse |

### Phase 2 — Advanced Analytics

- Vulnerability Trending (Findings über Zeit pro Asset)
- Risk Score Timeline pro Tenant
- Benchmark: "Wie sicher sind Sie vs. Branchendurchschnitt?"
- Remediation Heatmap (Welche Findings werden am schnellsten gefixt?)

---

## 6. Daten-Pipeline Phase 2

```
Scan abgeschlossen
       │
       ▼
PostgreSQL (structured findings)
       │
       ├──► S3 (raw scan data)
       │
       ▼
ETL Pipeline (Apache Airflow oder dbt)
       │
       ▼
Analytics DB (separate PostgreSQL oder BigQuery)
       │
       ├──► Grafana Dashboards (intern)
       └──► Tenant-facing Analytics API
```

---

## 7. Tools & Frameworks Empfehlung

| Zweck | Tool | Phase |
|-------|------|-------|
| AI Finding Explanation | Anthropic Claude API (claude-sonnet-4-6) | Phase 2 |
| Embeddings | Claude Embeddings oder OpenAI | Phase 2/3 |
| Vector Search | pgvector (PostgreSQL Extension) | Phase 2/3 |
| ML Training | scikit-learn, XGBoost | Phase 3 |
| ML Serving | FastAPI + Modell-Pickle | Phase 3 |
| Data Pipeline | dbt (SQL-basiert, einfach) | Phase 2 |
| Analytics DB | BigQuery oder Redshift | Phase 3 |
| Notebooks | JupyterHub (intern) | Phase 2 |
| Feature Store | (noch nicht nötig) | Phase 4 |

---

## 8. Phase-1-Aufgaben für Datenfundament

**Diese Aufgaben sind in Phase 1 Pflicht (auch ohne KI-Features):**

- [ ] Alle Findings vollständig strukturiert (CWE, OWASP, CVSS immer gesetzt)
- [ ] Raw-Scanner-Output in S3 gespeichert (für späteres Labeling)
- [ ] Scanner-Version in Finding gespeichert
- [ ] False-Positive-Markierung implementiert (Label-Quelle!)
- [ ] Structured Logging im Scanner (JSON, kein Freitext)
- [ ] Scan-Start- und Endzeiten mit Millisekunden
- [ ] Erkannte Technologien (Webserver, Framework) pro Target
