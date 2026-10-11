# CLAUDE.md — PTaaS

## APPROVAL-PFLICHT (GILT NUR FÜR KRITISCHE ÄNDERUNGEN)

Vor diesen Änderungen **immer** AUFTRAG → VORSCHLAG → APPROVE? durchlaufen:

| Kategorie | Beispiele |
|-----------|-----------|
| Datenbankmigrationen | Neue Prisma-Migration, Schema-Änderungen |
| ADR-Änderungen | Technologie-Entscheidungen, Architekturwechsel |
| Auth / Crypto / Security | JWT-Logik, Argon2, AES-Verschlüsselung, SSRF-Schutz, Token Rotation |
| Neue externe Dependencies | Neues npm/pip-Paket hinzufügen |
| Breaking API Changes | Endpoint umbenennen, Response-Schema ändern |
| Produktionsdaten / Secrets | `.env`-Struktur, Docker Secrets, Umgebungsvariablen |

## AUTONOME IMPLEMENTIERUNG (KEIN APPROVAL NÖTIG)

Claude implementiert eigenständig, zeigt danach das Ergebnis:

- UI-Komponenten und Layouts (React, Tailwind, shadcn/ui)
- Tests (Vitest Unit-Tests, Playwright E2E)
- Refactoring innerhalb bestehender Patterns
- Konfigurationsdateien (ESLint, Prettier, tsconfig, etc.)
- Bugfixes für bekannte Probleme
- Alles was explizit im aktiven Sprint-Backlog steht
- Loading/Error States, Skeleton-Komponenten
- Typdefinitionen und Interfaces

## SPRINT-KONTEXT

Zu Beginn jedes Sprints den aktiven Sprint nennen (z.B. „Wir sind in Sprint 1 — M1").
Claude arbeitet dann autonom innerhalb des Sprint-Scopes ohne Einzelfreigaben.

## AUSGABE NACH AUTONOMER IMPLEMENTIERUNG

Nach jeder autonomen Änderung kurz nennen:
- Was wurde geändert (Datei + was)
- Ob Tests grün sind (falls ausführbar)
- Nächster Schritt
