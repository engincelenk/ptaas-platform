-- M56: Pentest Methodology Checklists
CREATE TABLE "checklist_items" (
    "id"             TEXT NOT NULL,
    "project_id"     TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category"       TEXT NOT NULL,
    "item_key"       TEXT NOT NULL,
    "checked"        BOOLEAN NOT NULL DEFAULT false,
    "checked_by_id"  TEXT,
    "checked_at"     TIMESTAMP(3),
    "note"           TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checklist_items_project_id_item_key_key"
    ON "checklist_items"("project_id", "item_key");

CREATE INDEX "checklist_items_project_id_idx"      ON "checklist_items"("project_id");
CREATE INDEX "checklist_items_organization_id_idx" ON "checklist_items"("organization_id");

ALTER TABLE "checklist_items"
    ADD CONSTRAINT "checklist_items_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checklist_items"
    ADD CONSTRAINT "checklist_items_checked_by_id_fkey"
    FOREIGN KEY ("checked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
