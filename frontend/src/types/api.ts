export type UserRole = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "MANAGER" | "WAREHOUSE_OPERATOR" | "AUDITOR";

export type WarehouseStatus = "ACTIVE" | "CLOSED" | "MAINTENANCE";

export type MovementType = "INCOMING" | "OUTGOING" | "TRANSFER" | "ADJUSTMENT" | "WRITE_OFF";

export type MovementStatus = "PENDING" | "APPROVED" | "IN_TRANSIT" | "COMPLETED" | "REJECTED";

export type PriceChangeReason =
  | "BASE_PRICE"
  | "SEASONAL"
  | "PROMOTION"
  | "DEAD_STOCK_DECAY"
  | "MANUAL_ADJUSTMENT";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Array<{ field?: string; message: string }>;
  retry_after_ms?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface Pagination {
  has_more: boolean;
  next_cursor: string | null;
  count: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: Pagination;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  _count?: {
    users: number;
    warehouses: number;
    products: number;
  };
}

export interface TenantDetail extends Tenant {
  users?: User[];
}

export interface User {
  id: string;
  tenant_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role: UserRole;
  is_active?: boolean;
  is_email_verified?: boolean;
  tenant?: Tenant | null;
  created_at?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  user: User;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
}

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description?: string | null;
  category: string;
  base_price: number | string;
  discount_percentage: number;
  is_discontinued: boolean;
  sold_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface Warehouse {
  id: string;
  tenant_id: string;
  name: string;
  country: string;
  city: string;
  status: WarehouseStatus;
  is_hidden: boolean;
  hidden_at?: string | null;
  locations?: Location[];
  _count?: {
    locations: number;
  };
  created_at?: string;
  updated_at?: string;
}

export interface Location {
  id: string;
  warehouse_id: string;
  name: string;
  address?: string | null;
  capacity_units: number;
  current_volume: number;
  warehouse?: Pick<Warehouse, "id" | "name" | "city" | "country" | "status" | "tenant_id">;
  _count?: {
    inventory_stocks: number;
  };
  created_at?: string;
  updated_at?: string;
}

export interface Inventory {
  id: string;
  product_id: string;
  location_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_point: number;
  max_stock_level: number;
  last_sold_at?: string | null;
  product?: Product | Pick<Product, "sku" | "name" | "category" | "base_price">;
  location?: Location & { warehouse?: Pick<Warehouse, "name" | "city" | "country" | "status"> };
  inventory_lots?: InventoryLot[];
  created_at?: string;
  updated_at?: string;
}

export interface InventoryLot {
  id: string;
  inventory_id: string;
  parent_lot_id?: string | null;
  lot_code: string;
  quantity_received: number;
  quantity_on_hand: number;
  quantity_reserved: number;
  unit_cost: number | string;
  received_at: string;
  expires_at?: string | null;
  last_decay_applied_at?: string | null;
}

export interface InventoryReservation {
  id: string;
  inventory_id: string;
  user_id: string;
  quantity: number;
  status: "ACTIVE" | "RELEASED" | "EXPIRED";
  expires_at: string;
  released_at?: string | null;
  reason?: string | null;
}

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  product_id: string;
  supplier_sku?: string | null;
  unit_cost: number | string;
  min_order_quantity: number;
  product?: Pick<Product, "id" | "sku" | "name">;
}

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_email?: string | null;
  phone?: string | null;
  lead_time_days: number;
  is_active: boolean;
  supplier_products?: SupplierProduct[];
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  product_id: string;
  location_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number | string;
  product?: Pick<Product, "id" | "sku" | "name">;
  location?: Pick<Location, "id" | "name"> & { warehouse?: Pick<Warehouse, "id" | "name"> };
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  supplier_id: string;
  created_by_id: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RECEIVED" | "CLOSED" | "CANCELLED";
  expected_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  received_at?: string | null;
  cancelled_at?: string | null;
  notes?: string | null;
  supplier?: Supplier;
  lines?: PurchaseOrderLine[];
  created_at?: string;
  updated_at?: string;
}

export interface ReorderForecast {
  inventory_id: string;
  product: Pick<Product, "id" | "sku" | "name" | "category">;
  location: Pick<Location, "id" | "name"> & { warehouse?: Pick<Warehouse, "name"> };
  window_days: number;
  sold_quantity: number;
  daily_demand: number;
  lead_time_days: number;
  available_quantity: number;
  reorder_point: number;
  expected_demand_during_lead_time: number;
  recommended_order_quantity: number;
}

export interface StockMovement {
  id: string;
  product_id: string;
  user_id: string;
  from_location_id?: string | null;
  to_location_id?: string | null;
  quantity: number;
  movement_type: MovementType;
  status: MovementStatus;
  reason?: string | null;
  created_at?: string;
  approved_at?: string | null;
  completed_at?: string | null;
  updated_at?: string;
  product?: Pick<Product, "id" | "sku" | "name" | "category">;
  user?: Pick<User, "id" | "email" | "first_name" | "last_name" | "role">;
  from_location?: Pick<Location, "id" | "name"> & { warehouse?: Pick<Warehouse, "id" | "name" | "tenant_id"> };
  to_location?: Pick<Location, "id" | "name"> & { warehouse?: Pick<Warehouse, "id" | "name" | "tenant_id"> };
}

export interface DeadStockLot {
  inventory_lot_id: string;
  lot_code: string;
  received_at: string;
  quantity_on_hand: number;
  last_decay_applied_at?: string | null;
  inventory_id: string;
  location_id: string;
  product_id: string;
  tenant_id: string;
  sku: string;
  name: string;
  base_price: number;
  catalog_discount: number;
  days_in_stock: number;
}

export interface DecayAudit {
  id: string;
  inventory_lot_id: string;
  product_id: string;
  location_id?: string | null;
  old_discount_pct: number;
  new_discount_pct: number;
  days_in_inventory: number;
  automatic_trigger_at: string;
  created_at: string;
  product?: Pick<Product, "sku" | "name">;
  inventory_lot?: Pick<InventoryLot, "lot_code">;
}

export interface JobStatus {
  id: string;
  queue?: string;
  type?: string;
  status: "queued" | "active" | "completed" | "failed";
  attempts?: number;
  max_attempts?: number;
  result?: unknown;
  last_error?: string | null;
}
