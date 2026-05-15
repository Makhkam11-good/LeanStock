CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Tenant" ("id", "name", "slug", "is_active", "created_at", "updated_at")
VALUES ('default-tenant', 'Default Company', 'default-company', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "User" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "Product" ADD COLUMN "tenant_id" TEXT;

UPDATE "User"
SET "tenant_id" = 'default-tenant'
WHERE "role" <> 'SYSTEM_ADMIN' AND "tenant_id" IS NULL;

UPDATE "Warehouse"
SET "tenant_id" = 'default-tenant'
WHERE "tenant_id" IS NULL;

UPDATE "Product"
SET "tenant_id" = 'default-tenant'
WHERE "tenant_id" IS NULL;

ALTER TABLE "Warehouse" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "tenant_id" SET NOT NULL;

DROP INDEX IF EXISTS "Warehouse_name_key";
DROP INDEX IF EXISTS "Product_sku_key";

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");
CREATE INDEX "Tenant_is_active_idx" ON "Tenant"("is_active");
CREATE INDEX "User_tenant_id_idx" ON "User"("tenant_id");
CREATE INDEX "Warehouse_tenant_id_idx" ON "Warehouse"("tenant_id");
CREATE UNIQUE INDEX "Warehouse_tenant_id_name_key" ON "Warehouse"("tenant_id", "name");
CREATE INDEX "Product_tenant_id_idx" ON "Product"("tenant_id");
CREATE UNIQUE INDEX "Product_tenant_id_sku_key" ON "Product"("tenant_id", "sku");

ALTER TABLE "User" ADD CONSTRAINT "User_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
