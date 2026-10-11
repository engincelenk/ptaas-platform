# UX-DECISIONS.md — PTaaS

> Dokumentierte UX-Entscheidungen mit Begründung. Referenz für Implementierung, Code-Reviews und zukünftige Iterationen.

---

## 1. Navigationsarchitektur

### 1.1 Sidebar: Workspace vs. Admin getrennt

**Entscheidung:** Zwei getrennte Nav-Sektionen im Sidebar — „Workspace" (Dashboard, Scans, Findings, Reports, Targets) und „Admin" (Team, Einstellungen).

**Begründung:** Verhindert, dass CISO-User versehentlich Admin-Aktionen (Billing, SSO-Konfiguration) durchführen. Klar getrennte Verantwortungsbereiche. Developer sehen ggf. gar keinen Admin-Bereich.

**Implementierung:** `role` aus JWT-Token steuert welche Nav-Sections sichtbar sind. Admin-Section: nur für `admin` und `security-engineer` Roles.

---

### 1.2 Notifications als Flyout, nicht als eigene Seite

**Entscheidung:** Notification-Center als Disclosure-Flyout (Top-Bar), nicht als eigene `/notifications`-Route.

**Begründung:** Security Engineers scannen Notifications im Vorbeilaufen. Eine eigene Seite kostet 2 Klicks + Navigation. Flyout erlaubt sofortigen Context-Wechsel ohne Route-Change. Nur „Alle ansehen →" navigiert zur Notifications-Page (für ältere History).

**ARIA-Pattern:** `aria-haspopup="dialog"` + `aria-expanded` auf Trigger-Button. `role="dialog"` auf Flyout. ESC schließt + gibt Fokus zurück.

---

### 1.3 Inline Status-Change in Findings-Tabelle

**Entscheidung:** Status-Änderung direkt in der Tabellen-Zeile via Select-Element, kein Navigation zur Detail-Page notwendig.

**Begründung:** Security Engineers ändern 10–20 Finding-Status täglich. Jede Detail-Navigation kostet 3–5 Sekunden. Bei 15 Status-Änderungen = 1+ Minute täglich verschwendet. Inline-Change reduziert auf ~1s.

**Feedback:** `role="status"` Live-Region mit „Status geändert zu: [Wert]" für Screen Reader. Snackbar für visuelles Feedback (3s auto-dismiss).

**A11y:** Jeder Select hat `<label class="vh">Status für [Finding-Name]</label>` via `for`-Attribut.

---

## 2. Persona-Entscheidungen

### 2.1 Developer-Ansicht: AI-Erklärung zuerst

**Entscheidung:** In der Developer-Ansicht steht der AI-Erklärungsblock VOR den technischen Details (CVSS, CWE, HTTP-Request).

**Begründung:** Developer ohne Security-Hintergrund können mit CVSS 9.8 oder CWE-89 nichts anfangen. Eine Analogie-basierte AI-Erklärung gibt ihnen zuerst das Verständnis, dann die Details. Technische Details im Accordion (collapsed by default).

**Developer-Ansicht enthält:**
1. AI-Erklärung (expanded, purple block)
2. 3-Step-Fix-Guide mit Code-Beispielen
3. Accordion: Technische Details (CVSS, CWE, HTTP-Request)

---

### 2.2 Engineer-Ansicht: Technicals zuerst

**Entscheidung:** In der Engineer-Ansicht stehen CVSS, CWE, CVSS-Vector und HTTP-Request/Response ZUERST — AI-Erklärung im Accordion (collapsed).

**Begründung:** Security Engineers kennen CVSS und CWE. Sie brauchen sofort die technischen Details zum eigenen Assessment. AI-Erklärung ist für sie redundant und stört den Flow.

**Engineer-Ansicht enthält:**
1. CVSS-Scorecard (4 Metriken nebeneinander)
2. HTTP Request/Response (Code-Block)
3. Accordion: KI-Analyse & Fix-Empfehlung (collapsed)

---

### 2.3 Persona-Toggle-Persistenz

**Entscheidung:** Persona-Wahl wird in `localStorage` unter `ptaas.finding.persona` gespeichert.

**Begründung:** Ein Developer, der einmal „Developer-Ansicht" wählt, möchte das nicht bei jedem Finding neu einstellen.

**Default:** `developer` für neue User / wenn kein localStorage-Eintrag. `engineer` für User mit Role `security-engineer`.

**ARIA:** `role="group" aria-label="Ansicht wählen"` + `aria-pressed="true/false"` auf den Buttons.

---

### 2.4 CISO-Dashboard: AI-30-Sekunden-Briefing

**Entscheidung:** CISO-Ansicht zeigt prominentes AI-Briefing als erste Sektion (purple-gradient Block).

**Begründung:** CISO öffnet Dashboard selten (1–3x/Woche), braucht sofort den Executive-Summary ohne durch Metrics scrollen zu müssen. Briefing enthält: Was ist neu? Was erfordert meine Entscheidung? Was hat sich verbessert?

**Aktualisierung:** AI-Briefing wird bei jedem Scan-Abschluss neu generiert (Streaming via SSE). Timestamp sichtbar.

---

## 3. Action Banner

### 3.1 Kontextueller Action-Banner oben im Dashboard

**Entscheidung:** Wenn Critical Findings ohne Owner vorhanden sind, erscheint ein Warning-Banner direkt unter dem Page-Header mit CTA „Jetzt ansehen".

**Begründung:** Critical Findings sind der wichtigste Information für Security-Teams. Dashboard-Metriken allein werden übersehen. Banner zieht Aufmerksamkeit auf sich ohne Modal/Interrupt zu sein.

**Regeln:**
- `danger` Banner: Critical Finding ohne Owner > 48h
- `warning` Banner: Critical Finding ohne Owner < 48h
- `info` Banner: Allgemeine Infos (neues Feature etc.)
- Kein Banner wenn keine Critical Findings offen

---

### 3.2 Critical Finding Mid-Scan Alert

**Entscheidung:** Wenn während eines laufenden Scans ein Critical Finding entdeckt wird, erscheint sofort ein `danger` Banner mit zwei Optionen: „Sofort ansehen" und „Ignorieren".

**Begründung:** Warten bis Scan abgeschlossen ist, kostet bei echten kritischen Findings wertvolle Zeit. RCE-Findings z.B. sollten sofort kommuniziert werden.

**Implementierung:** WebSocket-Event `finding.critical.discovered` → Frontend zeigt Banner. Scan läuft weiter im Hintergrund.

---

## 4. Loading & Skeleton States

### 4.1 Skeleton-Shapes matchen Content-Shapes exakt

**Entscheidung:** Skeleton-Elemente haben exakt dieselben Dimensionen wie der spätere Inhalt (Höhe, Breite, border-radius).

**Begründung:** Minimiert Cumulative Layout Shift (CLS). Kein Layout-Sprung beim Loaded-State. Google Core Web Vitals Target: CLS < 0.1.

**Implementierung:** Skeleton-Komponenten werden aus denselben Layout-Primitives gebaut wie Content-Komponenten. CSS-Klasse `.skeleton` ersetzt Content durch animierten Gradient.

---

### 4.2 AI-Analyse: 3-Phasen-Skeleton

**Entscheidung:** AI-Analyse hat drei sichtbare Loading-Phasen: (1) Leer mit Skeleton-Lines, (2) Streaming-Text mit Cursor, (3) Vollständig.

**Begründung:** Claude Sonnet Streaming kann 2–8s dauern. Statische Spinner geben kein Zeitgefühl. Streaming-Text signalisiert Aktivität und gibt dem User ein Fortschrittsgefühl.

**CSS:** AI-Block nutzt purple-gradient Hintergrund (`var(--purple-bg)`) für visuelle Differenzierung von normalen Content-Blöcken.

---

### 4.3 PDF-Ring-Progress

**Entscheidung:** PDF-Generierung zeigt kreisförmigen Progress-Ring statt Spinner oder Bar.

**Begründung:** Ring kommuniziert Gesamtfortschritt intuitiv. Percent-Zahl im Mittelpunkt gibt konkrete Information. Bei Fertigstellung morpht Ring zu Checkmark.

**A11y:** `prefers-reduced-motion` deaktiviert Animation. Ring bleibt statisch mit Textangabe „65%".

---

## 5. Accessibility-Regeln

### 5.1 Fokus-Ring: Immer sichtbar

**Entscheidung:** Alle interaktiven Elemente zeigen `outline: 3px solid #2563eb; outline-offset: 2px` beim Fokus (`:focus-visible`).

**Begründung:** WCAG 2.1 SC 2.4.7 (Focus Visible). Kontrast des Focus-Rings: Blau #2563eb auf Weiß → 5.9:1. Ausreichend für WCAG AA.

**Implementierung:** Global in `globals.css`: `*:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }`. `outline: none` nur für `:focus` ohne `:focus-visible` (Mouse-Klick).

---

### 5.2 Icon-Only Buttons: aria-label Pflicht

**Entscheidung:** Jeder Button ohne sichtbaren Text MUSS ein `aria-label` haben.

**Begründung:** WCAG 2.1 SC 1.1.1 (Non-text Content). Screen Reader liest sonst nur „Button" oder gar nichts.

**Pflicht-Labels:**
- Bell-Icon: `aria-label="Benachrichtigungen (N ungelesen)"` (Count im Label)
- Settings-Icon: `aria-label="Einstellungen"`
- Close-Icon: `aria-label="[Context] schließen"` (z.B. „Flyout schließen")
- Rescan-Icon: `aria-label="Scan wiederholen für [Target-Name]"`

---

### 5.3 Notification-Count: aria-hidden auf Badge

**Entscheidung:** Der rote Count-Badge (`3`) ist `aria-hidden="true"`. Die Zahl steckt im `aria-label` des Buttons.

**Begründung:** Verhindert doppelte Ankündigung: „Button 3 Benachrichtigungen 3 ungelesen" → stattdessen: „Benachrichtigungen 3 ungelesen". Clean, eindeutig.

---

### 5.4 Status-Select: Visually-Hidden Label

**Entscheidung:** Inline-Status-Selects in der Findings-Tabelle kriegen ein `<label class="vh">` mit Kontext.

**Begründung:** Select ohne Label wird als „Status" oder „Offen" (erster Option) gelesen — kein Kontext wofür. Mit Label: „Status für SQL Injection in /api/users, Offen".

**CSS `.vh`:** `position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;`

---

### 5.5 Live Regions für dynamische Updates

**Entscheidung:** Alle dynamischen Status-Änderungen werden über `role="status"` oder `role="alert"` Live Regions kommuniziert.

**Regeln:**
- `aria-live="polite"` (= `role="status"`): Status-Changes, Scan-Fortschritt, PDF fertig
- `aria-live="assertive"` (= `role="alert"`): Critical Findings, Error-Meldungen, Verifikations-Fehler
- `aria-atomic="true"`: Immer — ganzen Text lesen, nicht nur Diff

---

## 6. Onboarding-UX

### 6.1 4-Schritt-Progress mit semantischen Labels

**Entscheidung:** Onboarding-Fortschritt als horizontal Progress-Stepper mit Labels (Workspace / Ziel / Erster Scan / Team).

**Begründung:** Nutzer wollen wissen: Wie lange noch? 4 Schritte ist verdaulich. Labels geben Kontext was kommt.

### 6.2 Team-Einladung überspringbar

**Entscheidung:** Schritt 4 (Team einladen) kann übersprungen werden mit Link „Überspringen, ich lade später ein".

**Begründung:** Erzwungene Team-Einladung blockiert Solo-User die schnell starten wollen. Team-Management ist immer über Settings erreichbar.

### 6.3 Security-Hinweis bei Domain-Eingabe

**Entscheidung:** Bei Schritt 2 (Domain eingeben) erscheint Hinweis „Eigentumsnachweis erforderlich" bevor der User weitergeht.

**Begründung:** Verhindert, dass User versuchen fremde Domains zu scannen ohne zu verstehen warum das nicht funktioniert. Frühzeitige Erwartungssetzung.

---

## 7. Error Handling

### 7.1 Login-Fehler: Keine Feldspezifizierung

**Entscheidung:** Login-Fehler sagt „E-Mail oder Passwort ist falsch" — nennt beide Felder, nicht nur das falsche.

**Begründung:** User-Enumeration-Angriff: Wenn „E-Mail existiert nicht" angezeigt wird, kann ein Angreifer gültige E-Mail-Adressen enumerieren. Gleiche Fehlermeldung unabhängig ob E-Mail oder Passwort falsch.

### 7.2 Forgot-Password: Gleiche Response ob Existenz oder nicht

**Entscheidung:** Forgot-Password-Formular zeigt immer „Wir haben eine E-Mail gesendet" — unabhängig ob E-Mail-Adresse im System existiert.

**Begründung:** Selbe User-Enumeration-Prävention wie Login.

### 7.3 Scan-Fehler: Konkrete Ursache + 3 Lösungsvorschläge

**Entscheidung:** Scan-Fehler-Screen zeigt die genaue HTTP-Error-Response (429, 503 etc.) + nummerierte Lösungsliste.

**Begründung:** „Scan fehlgeschlagen" ohne Grund frustriert. Engineer braucht die technische Fehlermeldung zum Debuggen. Nummerierte Lösungen geben klare Handlungsoptionen.

---

## 8. Verification States

### 8.1 Drei Verification-States

**Entscheidung:** Verification hat drei explizite States: Fail (rot), Partial (gelb), Success (grün).

**Begründung:** „Partial Fixed" ist häufig bei SQLi (erster Payload geblockt, Union-Based noch offen). Binäres Fail/Success unterschlägt wichtige Information.

### 8.2 DNS-Verification Fehler: Expected vs. Actual

**Entscheidung:** DNS-Verification-Fehler zeigt zwei Spalten: „Erwartet" vs. „Erhalten".

**Begründung:** „DNS-Fehler" reicht nicht. Engineer muss sehen was der Scanner tatsächlich gefunden hat um den Fehler zu debuggen (Cache? Falscher Eintrag? Falsche Zone?).

---

## 9. Report-Erstellung

### 9.1 Zwei Audience-Typen

**Entscheidung:** Report-Config bietet zwei Templates: Executive (CISO/Management) und Technical (Engineers).

**Executive-Report enthält:** Risk-Score, Top 3 Critical, Business Impact, Trend, Empfehlungen in Prosaform.

**Technical-Report enthält:** Alle Findings mit CVSS, PoC-Code, HTTP-Requests, Timeline, Fix-Anleitungen.

**Begründung:** Ein einziger Report für beide Audiences führt zu zu langen Dokumenten. CISO will 2 Seiten, Engineer will 20 Seiten mit Details.

---

*Dokument erstellt: Juni 2026 · PTaaS UX-Phase abgeschlossen*
