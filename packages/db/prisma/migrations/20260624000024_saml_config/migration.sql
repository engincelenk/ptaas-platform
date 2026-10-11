-- M52: SAML SSO Config per Organization
CREATE TABLE "saml_configs" (
    "id"             TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "enabled"        BOOLEAN NOT NULL DEFAULT false,
    "idp_entry_point" TEXT NOT NULL,
    "idp_cert"       TEXT NOT NULL,
    "sp_entity_id"   TEXT NOT NULL,
    "attr_email"     TEXT NOT NULL DEFAULT 'email',
    "attr_first_name" TEXT NOT NULL DEFAULT 'firstName',
    "attr_last_name"  TEXT NOT NULL DEFAULT 'lastName',
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saml_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saml_configs_organization_id_key" ON "saml_configs"("organization_id");

ALTER TABLE "saml_configs"
    ADD CONSTRAINT "saml_configs_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
