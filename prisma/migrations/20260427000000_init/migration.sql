-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MANAGER', 'WAREHOUSE_OPERATOR', 'AUDITOR', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'CLOSED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "WarehouseRole" AS ENUM ('MANAGER', 'WAREHOUSE_OPERATOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INCOMING', 'OUTGOING', 'TRANSFER', 'ADJUSTMENT', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PriceChangeReason" AS ENUM ('BASE_PRICE', 'SEASONAL', 'PROMOTION', 'DEAD_STOCK_DECAY', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'WAREHOUSE_OPERATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWarehouse" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "role" "WarehouseRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "capacity_units" INTEGER NOT NULL DEFAULT 1000,
    "current_volume" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "base_price" DECIMAL(12,2) NOT NULL,
    "discount_percentage" INTEGER NOT NULL DEFAULT 0,
    "is_discontinued" BOOLEAN NOT NULL DEFAULT false,
    "sold_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "reorder_point" INTEGER NOT NULL DEFAULT 50,
    "max_stock_level" INTEGER NOT NULL DEFAULT 500,
    "last_sold_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "parent_lot_id" TEXT,
    "lot_code" TEXT NOT NULL,
    "quantity_received" INTEGER NOT NULL,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "last_decay_applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_location_id" TEXT,
    "to_location_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "movement_type" "MovementType" NOT NULL,
    "status" "MovementStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "location_id" TEXT,
    "user_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "discount_percentage" INTEGER NOT NULL DEFAULT 0,
    "reason" "PriceChangeReason" NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecayAudit" (
    "id" TEXT NOT NULL,
    "inventory_lot_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "location_id" TEXT,
    "old_discount_pct" INTEGER NOT NULL,
    "new_discount_pct" INTEGER NOT NULL,
    "days_in_inventory" INTEGER NOT NULL,
    "automatic_trigger_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecayAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");

CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");
CREATE INDEX "RefreshToken_user_id_idx" ON "RefreshToken"("user_id");

CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");
CREATE INDEX "Warehouse_status_idx" ON "Warehouse"("status");

CREATE UNIQUE INDEX "UserWarehouse_user_id_warehouse_id_key" ON "UserWarehouse"("user_id", "warehouse_id");
CREATE INDEX "UserWarehouse_warehouse_id_idx" ON "UserWarehouse"("warehouse_id");

CREATE UNIQUE INDEX "Location_warehouse_id_name_key" ON "Location"("warehouse_id", "name");
CREATE INDEX "Location_warehouse_id_idx" ON "Location"("warehouse_id");
CREATE INDEX "Location_current_volume_idx" ON "Location"("current_volume");

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_sku_idx" ON "Product"("sku");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_is_discontinued_idx" ON "Product"("is_discontinued");

CREATE UNIQUE INDEX "Inventory_product_id_location_id_key" ON "Inventory"("product_id", "location_id");
CREATE INDEX "Inventory_location_id_idx" ON "Inventory"("location_id");
CREATE INDEX "Inventory_product_id_idx" ON "Inventory"("product_id");
CREATE INDEX "Inventory_quantity_on_hand_idx" ON "Inventory"("quantity_on_hand");
CREATE INDEX "Inventory_last_sold_at_idx" ON "Inventory"("last_sold_at");

CREATE UNIQUE INDEX "InventoryLot_lot_code_key" ON "InventoryLot"("lot_code");
CREATE INDEX "InventoryLot_inventory_id_received_at_idx" ON "InventoryLot"("inventory_id", "received_at");
CREATE INDEX "InventoryLot_received_at_idx" ON "InventoryLot"("received_at");
CREATE INDEX "InventoryLot_last_decay_applied_at_idx" ON "InventoryLot"("last_decay_applied_at");
CREATE INDEX "InventoryLot_quantity_on_hand_idx" ON "InventoryLot"("quantity_on_hand");
CREATE INDEX "InventoryLot_parent_lot_id_idx" ON "InventoryLot"("parent_lot_id");

CREATE INDEX "StockMovement_product_id_idx" ON "StockMovement"("product_id");
CREATE INDEX "StockMovement_user_id_idx" ON "StockMovement"("user_id");
CREATE INDEX "StockMovement_from_location_id_idx" ON "StockMovement"("from_location_id");
CREATE INDEX "StockMovement_to_location_id_idx" ON "StockMovement"("to_location_id");
CREATE INDEX "StockMovement_status_idx" ON "StockMovement"("status");
CREATE INDEX "StockMovement_movement_type_idx" ON "StockMovement"("movement_type");
CREATE INDEX "StockMovement_created_at_idx" ON "StockMovement"("created_at");

CREATE INDEX "PriceHistory_product_id_idx" ON "PriceHistory"("product_id");
CREATE INDEX "PriceHistory_location_id_idx" ON "PriceHistory"("location_id");
CREATE INDEX "PriceHistory_effective_from_idx" ON "PriceHistory"("effective_from");
CREATE INDEX "PriceHistory_effective_to_idx" ON "PriceHistory"("effective_to");

CREATE INDEX "DecayAudit_inventory_lot_id_idx" ON "DecayAudit"("inventory_lot_id");
CREATE INDEX "DecayAudit_product_id_idx" ON "DecayAudit"("product_id");
CREATE INDEX "DecayAudit_location_id_idx" ON "DecayAudit"("location_id");
CREATE INDEX "DecayAudit_created_at_idx" ON "DecayAudit"("created_at");

CREATE INDEX "AuditLog_user_id_idx" ON "AuditLog"("user_id");
CREATE INDEX "AuditLog_entity_type_idx" ON "AuditLog"("entity_type");
CREATE INDEX "AuditLog_entity_id_idx" ON "AuditLog"("entity_id");
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserWarehouse" ADD CONSTRAINT "UserWarehouse_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserWarehouse" ADD CONSTRAINT "UserWarehouse_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Location" ADD CONSTRAINT "Location_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_parent_lot_id_fkey" FOREIGN KEY ("parent_lot_id") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DecayAudit" ADD CONSTRAINT "DecayAudit_inventory_lot_id_fkey" FOREIGN KEY ("inventory_lot_id") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecayAudit" ADD CONSTRAINT "DecayAudit_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecayAudit" ADD CONSTRAINT "DecayAudit_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (enforced at DB level per blueprint)
ALTER TABLE "Inventory"
  ADD CONSTRAINT check_quantity_non_negative CHECK (quantity_on_hand >= 0),
  ADD CONSTRAINT check_quantity_reserved_valid CHECK (quantity_reserved >= 0);

ALTER TABLE "InventoryLot"
  ADD CONSTRAINT check_lot_received_positive CHECK (quantity_received > 0),
  ADD CONSTRAINT check_lot_quantity_non_negative CHECK (quantity_on_hand >= 0),
  ADD CONSTRAINT check_lot_reserved_valid CHECK (quantity_reserved >= 0);

ALTER TABLE "StockMovement"
  ADD CONSTRAINT check_movement_quantity_positive CHECK (quantity > 0);
