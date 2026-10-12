# AI Arena — Phase 1: Schema-Vorschlag (zur Freigabe, noch NICHT angewendet)

Status: Vorschlag · Datum: 2026-10-12 · Gehört zu: `2026-10-11-ai-arena-stage1-design.md` (Abschnitt 7)

## Entscheidungen

1. **Bestehendes `Target` wiederverwenden.** Jeder Kunden-KI-Endpunkt ist ein `Target` (Typ `URL`, Wert = Endpunkt-Basis-URL). Damit gelten die vorhandene Verifikation (DNS/HTTP/Meta), die TTL (`verifiedAt`), Projekt-Zuordnung und Mandantentrennung. `AiTarget` ist eine 1:1-Erweiterung (`targetId @unique`) mit den KI-spezifischen Feldern.
2. **Ein `Scan` pro Run.** `Finding.scanId` und `Finding.targetId` sind Pflichtfelder. Jeder `ArenaRun` legt deshalb einen `Scan` mit neuem Typ `AI_ARENA` an. Dadurch bleibt das **Finding-Modell unverändert** (Retest, Jira, SLA, Reports funktionieren weiter).
3. **Finding-Verknüpfung über `ArenaAttempt.findingId`** (nullable, `SetNull`), nicht über eine neue Spalte an `findings`.
4. **Katalog (`ArenaGoal`) und RoE (`ArenaRoe`) sind plattformweit** (keine `organizationId`), kuratiert und versioniert. Kunden können sie nicht ändern.
5. **Secrets:** `apiKeyEncrypted` und `knownPromptFragmentsEncrypted` werden mit `CryptoService` im `v2`-Format gespeichert (AAD `orgId:aiTargetId:feld`, Lesen nur per `decryptBound`).
6. **Retention:** `ArenaAttempt.expiresAt` (Default +30 Tage); ein späterer Cron löscht abgelaufene Texte.

## Auswirkungen auf bestehende Modelle (nur Prisma-Relationsfelder, **keine neuen Spalten**)

`Organization`, `User`, `Scan`, `Target`, `Finding` bekommen je ein Rückrelationsfeld (z. B. `arenaRuns ArenaRun[]`). Einzige echte Spaltenänderung an bestehenden Objekten: Enum `ScanType` + Wert `AI_ARENA` (additiv, rückwärtskompatibel).

## Vorgeschlagenes Schema

```prisma
enum ScanType {
  // … bestehende Werte unverändert …
  AI_ARENA   // AI Arena run (red vs customer AI)
}

enum ArenaAdapter {
  OPENAI_COMPAT
  ANTHROPIC
  GENERIC_JSON
}

enum ArenaRunStatus {
  DRAFT
  AWAITING_APPROVAL
  APPROVED
  RUNNING
  COMPLETED
  ABORTED
  FAILED
}

enum ArenaGoalCategory {
  PROMPT_INJECTION
  SYSTEM_PROMPT_LEAK
  SENSITIVE_DISCLOSURE
  JAILBREAK
  OUTPUT_HANDLING
}

enum ArenaAttemptKind {
  RECON
  ATTACK
}

enum ArenaVerdict {
  BREACH    // Verteidigung des Kunden wurde überwunden
  BLOCKED   // Verteidigung hat gehalten
  UNCLEAR   // manuelle Prüfung
}

model AiTarget {
  id             String       @id @default(cuid())
  organizationId String       @map("organization_id")
  targetId       String       @unique @map("target_id")   // verifiziertes Target (Typ URL)
  name           String
  adapter        ArenaAdapter
  // Request/Response-Mapping für GENERIC_JSON (JSON-Pfad-Angaben, keine Secrets)
  requestMapping  Json?       @map("request_mapping")
  responseMapping Json?       @map("response_mapping")
  authHeaderName  String?     @map("auth_header_name")    // z. B. "Authorization"
  // AES-256-GCM v2, AAD = orgId:aiTargetId:<feld>
  apiKeyEncrypted               String? @map("api_key_encrypted")
  knownPromptFragmentsEncrypted String? @map("known_prompt_fragments_encrypted")
  canaryPlacedAt DateTime?    @map("canary_placed_at")    // Kunde bestätigt Canary-Platzierung
  createdById    String       @map("created_by_id")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  target       Target       @relation(fields: [targetId], references: [id], onDelete: Cascade)
  createdBy    User         @relation("AiTargetCreatedBy", fields: [createdById], references: [id])
  runs         ArenaRun[]

  @@index([organizationId])
  @@map("ai_targets")
}

/// Plattformweiter, versionierter Rules-of-Engagement-Text (unveränderlich).
model ArenaRoe {
  id          String   @id @default(cuid())
  version     Int      @unique
  content     String   @db.Text
  contentHash String   @map("content_hash")
  createdAt   DateTime @default(now()) @map("created_at")

  runs ArenaRun[]

  @@map("arena_roe")
}

/// Plattformweiter, kuratierter Angriffskatalog (Stellvertreter-Ziele).
model ArenaGoal {
  id              String            @id @default(cuid())
  key             String            @unique              // z. B. "PI-001"
  version         Int               @default(1)
  category        ArenaGoalCategory
  title           String
  description     String            @db.Text
  owaspRef        String?           @map("owasp_ref")    // z. B. "LLM01"
  atlasRef        String?           @map("atlas_ref")    // z. B. "AML.T0051"
  baseSeverity    Severity          @map("base_severity")
  seedAttacks     Json              @map("seed_attacks") // string[]
  successCriteria Json              @map("success_criteria")
  active          Boolean           @default(true)
  createdAt       DateTime          @default(now()) @map("created_at")

  attempts ArenaAttempt[]

  @@index([category])
  @@map("arena_goals")
}

model ArenaRun {
  id             String         @id @default(cuid())
  organizationId String         @map("organization_id")
  aiTargetId     String         @map("ai_target_id")
  scanId         String         @unique @map("scan_id")   // Scan vom Typ AI_ARENA
  status         ArenaRunStatus @default(DRAFT)
  goalIds        String[]       @map("goal_ids")

  // Budget / Limits (Soll)
  maxRounds         Int   @default(5)      @map("max_rounds")
  maxRequests       Int   @default(100)    @map("max_requests")
  maxTokens         Int   @default(200000) @map("max_tokens")
  requestsPerSecond Float @default(1)      @map("requests_per_second")
  windowStart       DateTime? @map("window_start")
  windowEnd         DateTime? @map("window_end")
  // Verbrauch (Ist)
  usedRequests Int @default(0) @map("used_requests")
  usedTokens   Int @default(0) @map("used_tokens")

  // Freigabe / RoE (nur Org-Admin)
  roeId            String?   @map("roe_id")
  emergencyContact String?   @map("emergency_contact")
  approvedById     String?   @map("approved_by_id")
  approvedByName   String?   @map("approved_by_name")
  approvedAt       DateTime? @map("approved_at")

  // Reproduzierbarkeit
  modelVersions Json? @map("model_versions") // { red, judge, promptVersions }

  // Retest: Verweis auf den Vor-Run
  retestOfRunId String? @map("retest_of_run_id")

  abortedReason String?   @map("aborted_reason")
  startedAt     DateTime? @map("started_at")
  completedAt   DateTime? @map("completed_at")
  createdById   String    @map("created_by_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  aiTarget        AiTarget     @relation(fields: [aiTargetId], references: [id], onDelete: Cascade)
  scan            Scan         @relation(fields: [scanId], references: [id])
  roe             ArenaRoe?    @relation(fields: [roeId], references: [id])
  approvedBy      User?        @relation("ArenaRunApprovedBy", fields: [approvedById], references: [id])
  createdBy       User         @relation("ArenaRunCreatedBy", fields: [createdById], references: [id])
  retestOf        ArenaRun?    @relation("ArenaRetest", fields: [retestOfRunId], references: [id], onDelete: SetNull)
  retests         ArenaRun[]   @relation("ArenaRetest")
  attempts        ArenaAttempt[]
  recommendations ArenaRecommendation[]

  @@index([organizationId])
  @@index([aiTargetId])
  @@index([status])
  @@map("arena_runs")
}

model ArenaAttempt {
  id             String           @id @default(cuid())
  runId          String           @map("run_id")
  organizationId String           @map("organization_id")
  goalId         String           @map("goal_id")
  round          Int
  kind           ArenaAttemptKind
  technique      String                                  // z. B. "base64", "roleplay"
  attackText     String           @db.Text @map("attack_text")     // redacted
  responseText   String?          @db.Text @map("response_text")   // redacted
  verdict        ArenaVerdict?
  confidence     Float?
  evidence       Json?                                   // deterministische Belege (Canary, Fragment …)
  repro          Json?                                   // { k, n }
  tokens         Int              @default(0)
  latencyMs      Int?             @map("latency_ms")
  findingId      String?          @map("finding_id")     // bei bestätigtem Durchbruch
  expiresAt      DateTime         @map("expires_at")     // Retention (Default +30 Tage)
  createdAt      DateTime         @default(now()) @map("created_at")

  run          ArenaRun     @relation(fields: [runId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  goal         ArenaGoal    @relation(fields: [goalId], references: [id])
  finding      Finding?     @relation(fields: [findingId], references: [id], onDelete: SetNull)

  @@index([runId, round])
  @@index([organizationId])
  @@index([expiresAt])
  @@map("arena_attempts")
}

model ArenaRecommendation {
  id             String            @id @default(cuid())
  runId          String            @map("run_id")
  organizationId String            @map("organization_id")
  category       ArenaGoalCategory
  title          String
  text           String            @db.Text
  priority       Int               @default(2)           // 1 hoch … 3 niedrig
  createdAt      DateTime          @default(now()) @map("created_at")

  run          ArenaRun     @relation(fields: [runId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@index([organizationId])
  @@map("arena_recommendations")
}
```

Rückrelationsfelder (nur Prisma, keine Spalten): `Organization.{aiTargets, arenaRuns, arenaAttempts, arenaRecommendations}`, `User.{createdAiTargets @relation("AiTargetCreatedBy"), createdArenaRuns @relation("ArenaRunCreatedBy"), approvedArenaRuns @relation("ArenaRunApprovedBy")}`, `Target.aiTarget`, `Scan.arenaRun`, `Finding.arenaAttempts`.

## Migration

- Erzeugt **nicht von Hand**, sondern mit `prisma migrate diff --from-schema-datamodel <altes Schema> --to-schema-datamodel <neues Schema> --script` (braucht keine DB). Ergebnis wird als `20261012000058_ai_arena/migration.sql` abgelegt und von mir vor dem Anlegen gezeigt.
- Rein **additiv**: neue Tabellen/Enums + ein neuer Enum-Wert. Keine Datenmigration, kein Lock auf bestehende Tabellen außer dem kurzen `ALTER TYPE … ADD VALUE`.
- **Rollback:** Tabellen `arena_*`, `ai_targets` und die neuen Enums droppen. Der Enum-Wert `AI_ARENA` bleibt in `ScanType` bestehen (PostgreSQL kann Enum-Werte nicht entfernen), ist aber unschädlich.
- Hinweis zur Vorgeschichte: Die Phase-4-Migrationen wurden von Hand geschrieben und Schema und SQL waren zuvor auseinandergelaufen (ungültige Relationen). Deshalb Schema-first mit `migrate diff`.
- Tenant-Guard: neue Modelle werden in `TENANT_MODELS` (prisma.service.ts) aufgenommen — im Plan, nicht in der Migration.

## Bewusst nicht enthalten (YAGNI für Stufe 1)

Eigene Tabelle für RoE-Zustimmungen (Zustimmung steckt im Run: Name, Zeitstempel, `roeId`; Audit hat den Hash), Teilen von Findings mit Dritten, Schreib-Tools/RAG-Felder (Stufen 2–4 ergänzen additiv).
