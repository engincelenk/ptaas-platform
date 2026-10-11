# PTaaS Benutzeranleitung — Developer

**Zielgruppe:** Entwickler, die Findings bearbeiten, Bugs beheben und den Remediation-Fortschritt tracken.  
**Zugriff:** Member-Rolle · kein Admin-Bereich nötig  
**Sprache:** Deutsch (UI teilweise englisch)

---

## Inhaltsverzeichnis

1. [Erstanmeldung & MFA-Setup](#1-erstanmeldung--mfa-setup)
2. [Täglicher Login](#2-täglicher-login)
3. [Dashboard — Überblick](#3-dashboard--überblick)
4. [Projekte verstehen](#4-projekte-verstehen)
5. [Findings-Liste — Navigation & Filter](#5-findings-liste--navigation--filter)
6. [Finding Detail — Developer View](#6-finding-detail--developer-view)
7. [Status eines Findings ändern](#7-status-eines-findings-ändern)
8. [Kommentare & Kommunikation](#8-kommentare--kommunikation)
9. [Retest anfordern](#9-retest-anfordern)
10. [Bulk-Aktionen auf mehrere Findings](#10-bulk-aktionen-auf-mehrere-findings)
11. [Benachrichtigungen](#11-benachrichtigungen)
12. [Globale Suche](#12-globale-suche)
13. [Profil & Sicherheitseinstellungen](#13-profil--sicherheitseinstellungen)

---

## 1. Erstanmeldung & MFA-Setup

### 1.1 Konto erstellen

1. Rufe die App-URL auf (lokal: **http://localhost:3000**)
2. Klicke **"Create one"** unterhalb des Login-Formulars
3. Fülle alle Felder aus:
   - **Full name** — dein vollständiger Name
   - **Work email** — deine geschäftliche E-Mail-Adresse
   - **Organization name** — Name eurer Firma/eures Teams
   - **Organization URL slug** — wird automatisch aus dem Org-Namen generiert (z.B. `acme-corp`); nur Kleinbuchstaben und Bindestriche
   - **Password** — min. 12 Zeichen, Groß-/Kleinbuchstaben, Zahl, Sonderzeichen
   - Das **Passwort-Stärke-Meter** zeigt farblich an wie sicher dein Passwort ist (Ziel: grün = "Sehr stark")
   - **Confirm password** — Passwort wiederholen
4. Klicke **"Create account & set up MFA →"**

### 1.2 E-Mail-Bestätigung

Nach der Registrierung erscheint der Screen **"Bestätige deine E-Mail"**:
- Eine Bestätigungs-E-Mail wurde an deine Adresse gesendet
- Klicke den Link in der E-Mail
- In der **Entwicklungsumgebung** (lokaler Betrieb ohne Mail-Server): klicke direkt **"E-Mail bestätigt — MFA einrichten →"**

### 1.3 MFA (Zwei-Faktor) einrichten

MFA ist für alle Konten verpflichtend.

1. Du siehst einen **QR-Code** auf dem Screen
2. Öffne eine Authenticator-App auf deinem Smartphone:
   - Google Authenticator (iOS/Android)
   - Authy (iOS/Android)
   - Microsoft Authenticator (iOS/Android)
3. Tippe in der App auf **"Konto hinzufügen"** → **"QR-Code scannen"**
4. Scanne den QR-Code im Browser
5. Gib den **6-stelligen Code** aus der App in die 6 Eingabefelder ein
   - Die Felder wechseln automatisch beim Tippen
   - Du kannst den 6-stelligen Code auch **einfügen (Paste)** — alle Felder füllen sich automatisch
6. Klicke **"Verify"**
7. Du wirst zum **Onboarding** weitergeleitet

### 1.4 Backup-Codes

> Nach dem MFA-Setup werden **Backup-Codes** angezeigt. Speichere sie sicher (z.B. Passwort-Manager). Du kannst sie nutzen, wenn du dein Smartphone verlierst.

---

## 2. Täglicher Login

### 2.1 Normaler Login

1. Rufe **http://localhost:3000** auf
2. Gib **E-Mail** und **Passwort** ein
3. Klicke **"Sign in"**
4. Gib den **6-stelligen MFA-Code** aus deiner Authenticator-App ein
   - 6 separate Eingabefelder — Zahlen einzeln tippen oder gesamten Code einfügen
5. Du bist eingeloggt

### 2.2 Passwort vergessen

1. Klicke auf dem Login-Screen **"Passwort vergessen?"** (links unten)
2. Gib deine E-Mail-Adresse ein
3. Klicke **"Reset-Link senden"**
4. Du siehst immer dieselbe Antwort (egal ob E-Mail existiert — Sicherheitsmaßnahme)
5. Prüfe dein Postfach; der Link ist **30 Minuten** gültig
6. Klicke den Link → du landest auf der Reset-Seite
7. Gib dein neues Passwort ein (Stärke-Meter hilft bei der Wahl)
8. Passwort bestätigen → **"Passwort speichern"**

### 2.3 Konto gesperrt (Lockout)

Nach **5 fehlgeschlagenen Versuchen** wird dein Konto für **15 Minuten** gesperrt:
- Ein Countdown-Timer zeigt die verbleibende Sperrzeit
- Nach Ablauf erscheint **"Erneut versuchen"**
- Wende dich an deinen Admin, wenn du schneller wieder Zugriff brauchst

### 2.4 SSO-Login (falls konfiguriert)

1. Klicke **"Sign in with SSO"**
2. Gib den **Organization-Slug** ein (z.B. `acme-corp`)
3. Klicke **"Continue"** — du wirst zu eurem Identity-Provider weitergeleitet

---

## 3. Dashboard — Überblick

Das Dashboard ist deine Startseite nach dem Login. Als Developer interessieren dich hauptsächlich die KPI-Karten und die Top-Projekte.

### 3.1 KPI-Karten (oben)

| Karte | Was sie zeigt |
|-------|---------------|
| **Open Findings** | Gesamtzahl offener Findings in allen Projekten |
| **Critical** | Anzahl kritischer offener Findings |
| **High** | Anzahl hoher offener Findings |
| **Verified Fixed** | Findings, die als behoben verifiziert wurden |
| **Avg Risk Score** | Durchschnittlicher KI-Risikoscore (0–100) |

### 3.2 Action-Banner

Wenn kritische Findings ohne zugewiesenen Owner existieren, erscheint ein **orangefarbener Warning-Banner** oben:

> "X Critical Findings erfordern deine Entscheidung — Mindestens Y davon haben die SLA-Frist überschritten"

Klicke **"Jetzt ansehen"** → du wirst direkt zu den SLA-Breaches weitergeleitet.

### 3.3 Projekte-Liste (unten)

- Zeigt alle Projekte deiner Organisation
- Pro Projekt: Name, Anzahl offener Findings, Risk Score, Trend-Balken
- Klicke auf ein Projekt → Projekt-Detailseite

---

## 4. Projekte verstehen

### 4.1 Projektstruktur

```
Organisation
  └── Projekt (z.B. "Web App Produktion")
        ├── Targets (Domains/IPs die gescannt werden)
        ├── Scans (Scan-Läufe)
        └── Findings (Gefundene Schwachstellen)
```

### 4.2 Zu einem Projekt navigieren

- **Sidebar** → **"Projects"** → Projektliste
- Klicke auf den Projektnamen

### 4.3 Projekt-Übersicht

Die Projekt-Detailseite zeigt:
- **Targets** — welche Domains/IPs gescannt werden
- **Offene Findings** — aufgeteilt nach Severity
- **Letzte Scan-Ergebnisse**
- **Scan-Historie**

Als Developer brauchst du meistens nur **Findings** in einem Projekt.

---

## 5. Findings-Liste — Navigation & Filter

### 5.1 Zur Findings-Liste navigieren

- Sidebar → **"Projects"** → Projekt wählen → **"Findings"** Tab
- Oder: direkt über die URL `/projects/{projectId}/findings`

### 5.2 Suchfunktion

- Das **Suchfeld** oben links filtert nach Finding-Titel und Beschreibung
- Tippe mindestens 2 Zeichen — die Liste aktualisiert sich nach 300ms (Debounce)
- Suche ist case-insensitiv

### 5.3 Filteroptionen

| Filter | Funktion |
|--------|----------|
| **Severity** | CRITICAL / HIGH / MEDIUM / LOW / INFO |
| **Status** | OPEN / IN_PROGRESS / FIXED / VERIFIED / FALSE_POSITIVE / ACCEPTED_RISK |
| **OWASP** | Nach OWASP-Kategorie filtern (z.B. A01 – Broken Access Control) |
| **Tags** | Nach organisationsweiten Tags filtern |
| **CWE-ID** | Freitextsuche nach CWE-Nummer (z.B. "CWE-79") |
| **Verantwortliche** | Findings nach zugewiesenem Teammitglied filtern |

**Filter kombinieren:** Alle Filter können gleichzeitig aktiv sein.

**Filter zurücksetzen:** Klicke **"Clear"** rechts neben den Filtern.

### 5.4 Filter-Presets speichern

Du kannst häufig genutzte Filterkombinationen als Preset speichern:

1. Stelle die gewünschten Filter ein
2. Klicke auf das **Speichern-Icon** (Preset-Bereich rechts)
3. Gib dem Preset einen Namen (z.B. "Meine kritischen Findings")
4. Klicke **"Save"**
5. Das Preset erscheint als Button — klicke darauf um die Filter sofort anzuwenden
6. Presets löschen: kleines **×** neben dem Preset-Button

### 5.5 Tabellenspalten verstehen

| Spalte | Bedeutung |
|--------|-----------|
| **Finding** | Titel + ggf. CVE-IDs |
| **Severity** | Schweregrad (farbkodiert) · KEV-Badge wenn CISA Known Exploited |
| **Status** | Aktueller Bearbeitungsstatus (inline änderbar — siehe Abschnitt 7) |
| **Risk** | KI-Risikoscore (0–100) |
| **OWASP** | OWASP-Kategorie |
| **FP%** | KI-Wahrscheinlichkeit für False Positive |

### 5.6 Leerer Filter-Zustand

Wenn deine Filter-Kombination keine Findings ergibt, siehst du **Recovery-Buttons**:
- "Nur Text suchen (alle Filter)" — entfernt Severity/Status-Filter, behält Suchtext
- "Nur Severity/Status zurücksetzen" — behält OWASP/Tag-Filter
- "Alle Filter zurücksetzen" — leert alles

### 5.7 Risk-Score-Anzeige (oben)

Über der Tabelle zeigt ein farbcodierter Block den **Gesamt-Risikoscore** des Projekts:
- **Rot (CRITICAL):** Sofortiger Handlungsbedarf
- **Orange (HIGH):** Hohe Priorität
- **Gelb (MEDIUM):** Mittlere Priorität
- **Grün (LOW/NONE):** Akzeptables Niveau

---

## 6. Finding Detail — Developer View

### 6.1 Finding öffnen

Klicke in der Tabelle auf den **Pfeil-Button (→)** ganz rechts in einer Zeile.

### 6.2 Developer View auswählen

Oben gibt es Tabs:
- **Developer View** ← das ist dein Tab
- Security Engineer
- Remediation
- Retest

Der zuletzt gewählte Tab wird gespeichert und beim nächsten Finding automatisch wieder ausgewählt (localStorage-Persistenz).

### 6.3 Was du im Developer View siehst

#### AI-Erklärung ("What is this?")
- Klarsprachige Erklärung der Schwachstelle
- Kein Security-Jargon — verständlich für Entwickler
- Generiert von Claude AI

#### AI-Remediation ("How to fix it")
- Schritt-für-Schritt-Anleitung zur Behebung
- Codebeispiele wo relevant
- In der Sprache deines Tech-Stacks formuliert

#### KI-Metriken (3 Karten)
- **AI Risk Score** — Priorisierung 0–100 (höher = kritischer)
- **False Positive Probability** — Wahrscheinlichkeit dass es kein echtes Problem ist
- **Target** — Welche Domain/IP betroffen ist

#### Business Impact Banner
Ganz oben (lila Hintergrund) steht der **geschäftliche Auswirkungstext** — erklärt in Nicht-Techniker-Sprache was passiert wenn das Finding nicht behoben wird.

#### False-Positive-Warnung
Wenn die KI >50% FP-Wahrscheinlichkeit ermittelt, erscheint ein **orangefarbener Banner**:
> "AI estimates X% probability this is a false positive. Verify manually before acting."

→ Prüfe das Finding manuell bevor du Aufwand investierst.

### 6.4 AI-Analyse noch nicht bereit

Falls die KI-Analyse noch läuft, siehst du einen **Skeleton-Ladebereich** (lila schimmernde Balken). Warte einige Sekunden und lade die Seite neu.

### 6.5 CISA KEV-Warnung

Wenn das Finding eine CVE enthält, die auf der **CISA Known Exploited Vulnerabilities (KEV)**-Liste steht, erscheint:
- Ein pulsierendes rotes **"⚠ CISA KEV"**-Badge im Header
- Ein roter Banner mit Erklärung
- → Das Finding hat höchste Priorität (P0) und muss sofort behoben werden

### 6.6 Tab: Evidence

Klicke auf den **"Evidence"**-Tab (falls vorhanden):
- Zeigt Screenshots, Logs und andere Beweise die der Scanner automatisch gesammelt hat
- Hilfreich um das Finding zu reproduzieren und den Fix zu verifizieren

### 6.7 Tab: Timeline

Zeigt den **vollständigen Verlauf** des Findings:
- Wann es entdeckt wurde
- Alle Status-Änderungen mit Timestamp und Benutzer
- Alle Kommentare in chronologischer Reihenfolge
- Retest-Anfragen und Ergebnisse

---

## 7. Status eines Findings ändern

### 7.1 Inline — direkt in der Tabelle

In der Findings-Liste hat jede Zeile ein **Dropdown im Status-Feld**:

1. Klicke das Dropdown in der Status-Spalte
2. Wähle den neuen Status
3. Die Änderung wird sofort gespeichert
4. Ein Screen-Reader-kompatibles Live-Update bestätigt: "Status geändert zu: In Bearbeitung"

### 7.2 Im Finding Detail

Im Finding-Detail oben rechts gibt es ein **Status-Select**:
1. Klicke das Dropdown
2. Wähle einen Status
3. Änderung wird sofort gespeichert + Toast-Meldung erscheint

### 7.3 Verfügbare Status

| Status | Bedeutung |
|--------|-----------|
| **OPEN** | Neu entdeckt, noch nicht bearbeitet |
| **IN_PROGRESS** | Du arbeitest aktiv daran |
| **FIXED** | Fix implementiert, wartet auf Verifikation |
| **VERIFIED** | Fix wurde durch Retest bestätigt |
| **FALSE_POSITIVE** | Finding ist kein echtes Sicherheitsproblem |
| **ACCEPTED_RISK** | Risiko wird bewusst akzeptiert (z.B. kein Fix möglich) |

**Empfohlener Workflow:**
```
OPEN → IN_PROGRESS → FIXED → (Retest anfordern) → VERIFIED
```

---

## 8. Kommentare & Kommunikation

### 8.1 Kommentar hinzufügen

Im Finding Detail → Tab **"Remediation"**:

1. Scrolle zum Kommentar-Bereich unten
2. Klicke in das Textfeld
3. Schreibe deinen Kommentar (Markdown wird unterstützt)
4. Klicke **"Add Comment"** (oder `Ctrl+Enter`)

### 8.2 Wann kommentieren?

- **Status-Änderung erklären:** Warum wird es als False Positive markiert?
- **Fragen stellen:** "Welche Komponente ist genau betroffen?"
- **Fix dokumentieren:** "Behoben in Commit abc123 — Input-Validierung in `/api/users` ergänzt"
- **Retest-Notizen:** Was wurde geändert, damit der Retest es weiß

### 8.3 Kommentare lesen

Alle Kommentare erscheinen chronologisch mit Timestamp und Autorname. Die Timeline zeigt Kommentare zusammen mit Status-Änderungen.

---

## 9. Retest anfordern

Wenn du einen Fix implementiert hast, kannst du einen **Retest** anfordern — der Scanner prüft dann erneut ob die Schwachstelle noch vorhanden ist.

### 9.1 Retest starten

Im Finding Detail → oben rechts:

1. Klicke **"Request Retest"**
2. (Optional) Gib eine Notiz ein: was wurde geändert, was soll der Retest prüfen
3. Bestätige — ein neuer Scan wird in die Queue gelegt
4. Du wirst zur Scan-Detailseite weitergeleitet

> Der Retest-Button ist nur sichtbar für Findings mit Status OPEN, IN_PROGRESS, FIXED oder VERIFIED.

### 9.2 Retest-Status verfolgen

- Oben rechts im Finding Detail erscheint ein **Status-Badge**: `Retest PENDING` / `Retest PASSED` / `Retest FAILED`
- Bei PENDING: läuft der Scan gerade
- Tab **"Retest"** zeigt Details zum laufenden/abgeschlossenen Retest

### 9.3 Retest-Ergebnis

Nach dem Retest:
- **PASSED** → Schwachstelle nicht mehr vorhanden → Status wird zu VERIFIED
- **FAILED** → Schwachstelle noch da → Status geht zurück zu OPEN

Im Tab "Retest" gibt es Buttons:
- **"Fix confirmed"** → manuell als VERIFIED markieren
- **"Fix not confirmed"** → zurück zu OPEN

---

## 10. Bulk-Aktionen auf mehrere Findings

### 10.1 Findings auswählen

- **Einzeln:** Checkbox links in jeder Zeile anklicken
- **Alle auswählen:** Checkbox im Tabellen-Header

### 10.2 Bulk-Status setzen

Wenn mindestens ein Finding ausgewählt ist, erscheint die **Bulk-Action-Bar** über der Tabelle:

1. Wähle den gewünschten Status im Dropdown der Bulk-Bar
2. Klicke **"Apply"**
3. Alle ausgewählten Findings werden auf den neuen Status gesetzt
4. Toast-Meldung bestätigt wie viele Findings aktualisiert wurden

### 10.3 Auswahl aufheben

Klicke **"Clear selection"** in der Bulk-Bar.

---

## 11. Benachrichtigungen

### 11.1 Benachrichtigungs-Glocke

Oben rechts in der Navigation: **Glocken-Icon** mit Badge (Zahl ungelesener Benachrichtigungen).

### 11.2 Benachrichtigungen öffnen

- Klicke die Glocke → Flyout-Panel öffnet sich
- Zeigt alle Benachrichtigungen (neu zuerst)
- Ungelesene sind farblich hervorgehoben

### 11.3 Tastatur-Navigation

- **ESC** → schließt das Flyout und setzt Fokus zurück auf die Glocke
- Tab-Navigation durch die Liste möglich

### 11.4 Wann bekommst du Benachrichtigungen?

- **Scan abgeschlossen** — dein Scan hat neue Findings gefunden
- **Retest abgeschlossen** — Ergebnis deines Retest-Requests
- **Kritisches Finding entdeckt** — während ein Scan läuft wird ein Critical Finding live gemeldet
- **Status-Änderung** — jemand ändert den Status eines dir zugewiesenen Findings
- **Kommentar** — jemand kommentiert an einem Finding in deinen Projekten

---

## 12. Globale Suche

### 12.1 Suche öffnen

- Klicke das **Lupen-Icon** in der oberen Navigation
- Oder Tastenkürzel: `Ctrl+K` (Windows/Linux) bzw. `Cmd+K` (Mac)

### 12.2 Was du suchen kannst

- **Findings** — nach Titel
- **Projekte** — nach Name
- **Targets** — nach Domain/IP

### 12.3 Suche nutzen

1. Tippe deinen Suchbegriff
2. Ergebnisse erscheinen sofort (live)
3. Klicke auf ein Ergebnis → direkte Navigation
4. Zuletzt besuchte Elemente werden als "Recent" vorgeschlagen

---

## 13. Profil & Sicherheitseinstellungen

### 13.1 MFA-Einstellungen verwalten

- Sidebar → **"Settings"** → **"Security"**
- Hier kannst du:
  - MFA deaktivieren (nur wenn Admin erlaubt)
  - Neue Authenticator-App registrieren
  - Backup-Codes einsehen

### 13.2 Passwort ändern

- Settings → Security → Passwort-Bereich
- Altes Passwort eingeben, neues setzen
- Stärke-Meter gibt Feedback

### 13.3 Konto-Daten bearbeiten

- Settings → Profil
- Name und E-Mail änderbar

---

## Häufige Fragen (Developer)

**F: Ein Finding ist als "FIXED" markiert — warum ist es noch in der Liste?**  
A: FIXED bedeutet du hast den Fix implementiert, aber er wurde noch nicht verifiziert. Fordere einen Retest an oder bitte einen Security Engineer um manuelle Verifikation.

**F: Die AI-Erklärung fehlt / sagt "in progress".**  
A: Die KI-Analyse läuft asynchron nach dem Scan. Warte 1–5 Minuten und lade die Seite neu.

**F: Ich sehe ein Finding mit 80% False-Positive-Wahrscheinlichkeit — soll ich es ignorieren?**  
A: Prüfe es kurz manuell. Wenn du bestätigst dass es kein echtes Problem ist, setze den Status auf FALSE_POSITIVE und erkläre im Kommentar warum.

**F: Wie finde ich nur meine zugewiesenen Findings?**  
A: In der Findings-Liste → Filter "Verantwortliche" → deinen Namen wählen.

**F: Was ist der Unterschied zwischen Risk Score und CVSS Score?**  
A: **CVSS** ist der standardisierte technische Score (von der NVD). Der **AI Risk Score** berücksichtigt zusätzlich den Kontext eurer Anwendung, EPSS-Exploit-Wahrscheinlichkeit und ob die CVE auf der CISA KEV-Liste steht — er ist also relevanter für eure konkrete Situation.
