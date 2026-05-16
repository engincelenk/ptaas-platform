# UX Designer – Nutzererlebnis PTaaS Platform

**Datum:** 2026-05-15  
**Rolle:** UX Designer  
**Phase:** Phase 1 MVP

---

## 1. Zielgruppe & Personas

### Persona 1 — "Max, der Security-Analyst"

| Attribut | Wert |
|---------|------|
| Rolle | IT-Security Analyst |
| Unternehmen | Mid-Market, 200-2000 MA |
| Technisches Level | Hoch (kennt CVSS, OWASP, Burp Suite) |
| Ziel | Schwachstellen schnell finden, priorisieren, reportieren |
| Frustration | Tools die zu viel manuellen Aufwand erfordern, FP-Überflutung |
| Success | "Ich starte einen Scan, sehe kritische Findings und habe in 10 Min einen Report" |

### Persona 2 — "Sandra, die IT-Leiterin"

| Attribut | Wert |
|---------|------|
| Rolle | IT-Leiterin / CISO |
| Technisches Level | Mittel (versteht Risiken, nicht Tools) |
| Ziel | Security-Überblick für Management, Compliance-Nachweis |
| Frustration | Technische Reports die Stakeholder nicht verstehen |
| Success | "Ich kann dem Vorstand in 2 Min zeigen wie sicher wir sind" |

### Persona 3 — "Tom, der Entwickler"

| Attribut | Wert |
|---------|------|
| Rolle | Backend Developer |
| Technisches Level | Sehr hoch (aber kein Security-Spezialist) |
| Ziel | Findings schnell verstehen und beheben |
| Frustration | Unklare Remediation-Hinweise, False Positives |
| Success | "Ich verstehe was kaputt ist und wie ich es fixe" |

---

## 2. User Journey (Hauptfluss — Persona Max)

```
1. ENTDECKUNG
   Liest über PTaaS → Besucht Landing Page
   → Sieht: "Kostenlos starten, kein Credit Card"
   
2. REGISTRIERUNG (< 2 Min)
   Email + Passwort → MFA einrichten (QR-Code) → Onboarding-Wizard
   → Direkt im Dashboard
   
3. ERSTES PROJEKT (< 1 Min)
   "+ Neues Projekt" → Name + Ziel-URL eingeben → "Erstellen"
   → Automatisch zum Projekt-Dashboard
   
4. ERSTER SCAN (< 30 Sek)
   "Scan starten" → Scan-Typ wählen (oder Default) → "Los"
   → Fortschrittsanzeige mit Live-Findings
   
5. FINDINGS AUSWERTEN (< 5 Min)
   Findings-Liste → Nach Severity filtern → Finding anklicken
   → Detail: Beschreibung + Beweis + Remediation
   → Status setzen: "Bestätigt", "False Positive"
   
6. REPORT ERSTELLEN (< 1 Min)
   "Report generieren" → PDF-Preview → Download
   → Link teilen mit Kollegen
```

---

## 3. Wireframe-Beschreibungen

### Screen 1 — Dashboard

```
┌─────────────────────────────────────────────────────┐
│  [Logo] PTaaS    Projekte  Settings    [Avatar] Max  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Guten Morgen, Max                    [+ Neuer Scan]│
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │CRITICAL │ │  HIGH   │ │ MEDIUM  │ │  OPEN   │  │
│  │    3    │ │   12    │ │   34    │ │   49    │  │
│  │ Findings│ │ Findings│ │ Findings│ │ Findings│  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                     │
│  Aktive Projekte                      Alle anzeigen │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🟢 example.com    Letzter Scan: vor 2h  3 NEW │  │
│  │ 🟡 shop.io        Letzter Scan: vor 1d  0 NEW │  │
│  │ ⚪ api.internal   Noch kein Scan         —    │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Aktuelle Scans                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ ⟳ example.com — Web Security Scan — 67%      │  │
│  │   [██████████████████░░░░░] Läuft seit 2 Min  │  │
│  │   3 Findings bisher (1 CRITICAL)              │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Severity-Trend (letzte 30 Tage)    [Chart]         │
└─────────────────────────────────────────────────────┘
```

### Screen 2 — Findings-Liste

```
┌─────────────────────────────────────────────────────┐
│  example.com / Findings                     [Export]│
├─────────────────────────────────────────────────────┤
│  [🔴 CRITICAL 3] [🟠 HIGH 12] [🟡 MEDIUM 34] [Alle]│
│                                                     │
│  Suche...              Status ▾    Sortierung ▾     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🔴 SQL Injection in Login-Endpoint      CVSS 9.8│  │
│  │    /api/v1/auth/login · Offen · vor 2h         │  │
│  │    CWE-89 · OWASP A03:2021                     │  │
│  │    [Bestätigen] [False Positive] [Details →]   │  │
│  ├───────────────────────────────────────────────┤  │
│  │ 🔴 Missing HSTS Header auf Hauptdomain   CVSS 7.5│
│  │    https://example.com · Offen · vor 2h        │  │
│  │    CWE-319 · OWASP A05:2021                    │  │
│  │    [Bestätigen] [False Positive] [Details →]   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Screen 3 — Finding-Detail

```
┌─────────────────────────────────────────────────────┐
│  ← Zurück zu Findings                               │
│                                                     │
│  🔴 Missing Strict-Transport-Security Header        │
│  CVSS 7.5 · HIGH · CWE-319 · OWASP A05:2021        │
│                                                     │
│  Status: [● Offen ▾]    Schweregrad: [HIGH ▾]      │
│                                                     │
│  ┌── WAS IST DAS PROBLEM? ──────────────────────┐  │
│  │ Der Strict-Transport-Security (HSTS) Header   │  │
│  │ fehlt. Dadurch können Angreifer im selben      │  │
│  │ Netzwerk HTTPS-Verbindungen auf HTTP herab-    │  │
│  │ stufen (SSL Stripping).                        │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌── BEWEIS ────────────────────────────────────┐  │
│  │ $ curl -I https://example.com               │  │
│  │ HTTP/2 200                                  │  │
│  │ content-type: text/html                     │  │
│  │ # Kein HSTS Header vorhanden                │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌── WIE BEHEBEN? ──────────────────────────────┐  │
│  │ Nginx: add_header Strict-Transport-Security   │  │
│  │        "max-age=31536000; includeSubDomains" │  │
│  │                                              │  │
│  │ Apache: Header always set Strict-Transport-  │  │
│  │         Security "max-age=31536000"          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [Als False Positive markieren]  [Status: Gefixt]  │
└─────────────────────────────────────────────────────┘
```

### Screen 4 — Neuer Scan (Modal)

```
┌───────────────────────────────────┐
│  Scan starten                   ✕ │
├───────────────────────────────────┤
│  Scan-Typ                         │
│  ◉ Vollständiger Scan (empfohlen) │
│  ○ Nur Web Security               │
│  ○ Nur SSL/TLS                    │
│  ○ Nur Ports                      │
│                                   │
│  Ziele                            │
│  https://example.com        [+ ]  │
│                                   │
│  ⚠ Scans nur auf autorisierten   │
│    Systemen starten               │
│                                   │
│  [Abbrechen]  [Scan starten →]   │
└───────────────────────────────────┘
```

---

## 4. UX-Prinzipien

### 1. Speed First — Jede Aktion < 3 Klicks

Von Dashboard zu laufendem Scan: max. 3 Klicks. Kein Wizard der 7 Schritte hat.

### 2. Severity-Farben sind heilig

| Severity | Farbe | Bedeutung |
|----------|-------|-----------|
| CRITICAL | Rot `#EF4444` | Sofortiger Handlungsbedarf |
| HIGH | Orange `#F97316` | Diese Woche beheben |
| MEDIUM | Gelb `#EAB308` | Geplant beheben |
| LOW | Blau `#3B82F6` | Im nächsten Sprint |
| INFO | Grau `#6B7280` | Zur Kenntnis |

**Konsistenz ist kritisch** — jede Farbe erscheint in derselben Bedeutung an jeder Stelle.

### 3. Leerer Zustand ≠ Fehler

Leere Findings-Liste = positives Signal. Zeige: "Glückwunsch — keine offenen Findings!" statt "Keine Daten".

### 4. Real-time ohne Lärm

Scan-Fortschritt live anzeigen, aber kein Push-Notification-Spam. Nur "Scan abgeschlossen" als Notification (opt-in).

### 5. Kontext-sensitives Onboarding

Ersten Scan nach der Registrierung mit einem 3-Schritt-Wizard begleiten. Danach weg damit.

---

## 5. Accessibility

| Anforderung | Standard | Umsetzung |
|-------------|---------|-----------|
| Farbkodierung | WCAG 2.1 AA | Immer zusätzlich Icon (🔴 🟠 🟡) — nie nur Farbe |
| Tastatur-Navigation | WCAG 2.1 AA | Alle Aktionen per Tab + Enter erreichbar |
| Screenreader | WCAG 2.1 AA | ARIA-Labels auf allen interaktiven Elementen |
| Kontrast | WCAG 2.1 AA | Min. 4.5:1 für Text |
| Fokus-Indikator | WCAG 2.1 AA | Sichtbarer Fokus-Ring (shadcn/ui Default) |

---

## 6. Design-System

### Stack: shadcn/ui + TailwindCSS

**Warum shadcn/ui:**
- Enterprise-Look ohne Custom-Designarbeit in Phase 1
- Vollständig anpassbar (kein Black-Box CSS)
- Barrierefreiheit eingebaut (Radix UI Primitives)
- Perfekte Next.js-Integration

### Kern-Komponenten Phase 1

```
DataTable       → Findings-Liste (sortierbar, filterbar, paginiert)
Badge           → Severity Labels (CRITICAL/HIGH/etc.)
Progress        → Scan-Fortschritt
Card            → KPI-Kacheln, Projekt-Karten
Dialog/Sheet    → Neuer Scan, Finding-Aktionen
Tabs            → Projekt-Navigation
Charts (Recharts) → Severity-Trend, Scan-History
```

### Typografie & Farben

```css
/* Brand-Primärfarbe */
--primary: #6366F1;   /* Indigo — modern, trustworthy */
--primary-dark: #4F46E5;

/* Dark Mode First */
--background: #0F172A;  /* Slate-900 */
--surface: #1E293B;     /* Slate-800 */
--border: #334155;      /* Slate-700 */
--text: #F8FAFC;        /* Slate-50 */
--muted: #94A3B8;       /* Slate-400 */
```

**Referenz-Look:** Linear.app — minimalistisch, professionell, schnell.

---

## 7. Mobile-Strategie

**Phase 1: Desktop First** — Security-Arbeit passiert am Desktop.

Responsive (min. funktional auf Tablet) für:
- Dashboard KPI-Übersicht
- Findings-Liste (vereinfacht)

**Phase 2:** Progressive Web App (PWA) für Notifications.

**Keine native App** in Phase 1.
