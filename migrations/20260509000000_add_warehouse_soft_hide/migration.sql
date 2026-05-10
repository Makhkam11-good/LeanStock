ALTER TABLE "Warehouse"
  ADD COLUMN "is_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hidden_at" TIMESTAMP(3);

CREATE INDEX "Warehouse_is_hidden_idx" ON "Warehouse"("is_hidden");
