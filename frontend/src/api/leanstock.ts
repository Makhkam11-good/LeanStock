import { apiRequest, unwrap } from "./client";
import type {
  ApiResponse,
  DeadStockLot,
  DecayAudit,
  Inventory,
  JobStatus,
  LoginResponse,
  PaginatedResponse,
  Product,
  RefreshResponse,
  StockMovement,
  Tenant,
  TenantDetail,
  User,
  UserRole,
  Warehouse,
  Location,
  PurchaseOrder,
  ReorderForecast,
  Supplier,
} from "../types/api";

export interface ListParams {
  limit?: number;
  after?: string | null;
  search?: string;
}

export const authApi = {
  login: (body: { email: string; password: string }) =>
    unwrap(apiRequest<ApiResponse<LoginResponse>>("/auth/login", { method: "POST", body, auth: false })),
  signup: (body: {
    company_name: string;
    company_slug?: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) => unwrap(apiRequest<ApiResponse<User & { verification_required?: boolean; verification_token?: string }>>("/auth/signup", {
    method: "POST",
    body,
    auth: false,
  })),
  me: () => unwrap(apiRequest<ApiResponse<User>>("/auth/me")),
  refreshToken: (refresh_token: string) =>
    unwrap(apiRequest<ApiResponse<RefreshResponse>>("/auth/refresh-token", {
      method: "POST",
      body: { refresh_token },
      auth: false,
    })),
  logout: (refresh_token?: string | null) =>
    unwrap(apiRequest<ApiResponse<{ message: string }>>("/auth/logout", {
      method: "POST",
      body: refresh_token ? { refresh_token } : {},
      auth: false,
    })),
  verifyEmail: (token: string) =>
    unwrap(apiRequest<ApiResponse<User>>("/auth/verify-email", { method: "POST", body: { token }, auth: false })),
  resendVerification: (email: string) =>
    unwrap(apiRequest<ApiResponse<{ message: string; verification_token?: string }>>("/auth/resend-verification", {
      method: "POST",
      body: { email },
      auth: false,
    })),
  requestPasswordReset: (email: string) =>
    unwrap(apiRequest<ApiResponse<{ message: string; reset_token?: string }>>("/auth/request-password-reset", {
      method: "POST",
      body: { email },
      auth: false,
    })),
  resetPassword: (body: { token: string; new_password: string }) =>
    unwrap(apiRequest<ApiResponse<{ message: string }>>("/auth/reset-password", { method: "POST", body, auth: false })),
  changePassword: (body: { current_password: string; new_password: string }) =>
    unwrap(apiRequest<ApiResponse<{ message: string }>>("/auth/change-password", { method: "POST", body })),
  registerUser: (body: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
    role?: Exclude<UserRole, "SYSTEM_ADMIN" | "COMPANY_ADMIN">;
    tenant_id?: string;
  }) => unwrap(apiRequest<ApiResponse<User>>("/auth/register", { method: "POST", body })),
};

export const adminApi = {
  listTenants: (params: ListParams & { is_active?: "true" | "false" } = {}) =>
    apiRequest<PaginatedResponse<Tenant>>("/admin/tenants", { params }),
  getTenant: (id: string) => unwrap(apiRequest<ApiResponse<TenantDetail>>(`/admin/tenants/${id}`)),
  activateTenant: (id: string) => unwrap(apiRequest<ApiResponse<TenantDetail>>(`/admin/tenants/${id}/activate`, { method: "PATCH" })),
  deactivateTenant: (id: string) => unwrap(apiRequest<ApiResponse<TenantDetail>>(`/admin/tenants/${id}/deactivate`, { method: "PATCH" })),
};

export const userApi = {
  list: (params: ListParams & { tenant_id?: string; role?: UserRole; is_active?: "true" | "false" } = {}) =>
    apiRequest<PaginatedResponse<User>>("/users", { params }),
};

export const productApi = {
  list: (params: ListParams & { category?: string; is_discontinued?: "true" | "false" } = {}) =>
    apiRequest<PaginatedResponse<Product>>("/products", { params }),
  get: (id: string) => unwrap(apiRequest<ApiResponse<Product>>(`/products/${id}`)),
  create: (body: {
    sku: string;
    name: string;
    description?: string;
    category: string;
    base_price: number;
    discount_percentage?: number;
  }) => unwrap(apiRequest<ApiResponse<Product>>("/products", { method: "POST", body })),
  update: (id: string, body: Partial<Omit<Product, "id" | "tenant_id" | "sku" | "created_at" | "updated_at">>) =>
    unwrap(apiRequest<ApiResponse<Product>>(`/products/${id}`, { method: "PATCH", body })),
  discontinue: (id: string) => unwrap(apiRequest<ApiResponse<Product>>(`/products/${id}/discontinue`, { method: "POST" })),
};

export const warehouseApi = {
  list: (params: ListParams = {}) => apiRequest<PaginatedResponse<Warehouse>>("/warehouses", { params }),
  get: (id: string) => unwrap(apiRequest<ApiResponse<Warehouse>>(`/warehouses/${id}`)),
  create: (body: { name: string; country: string; city: string }) =>
    unwrap(apiRequest<ApiResponse<Warehouse>>("/warehouses", { method: "POST", body })),
  update: (id: string, body: Partial<Pick<Warehouse, "name" | "country" | "city" | "status">>) =>
    unwrap(apiRequest<ApiResponse<Warehouse>>(`/warehouses/${id}`, { method: "PATCH", body })),
  close: (id: string) => unwrap(apiRequest<ApiResponse<Warehouse>>(`/warehouses/${id}/close`, { method: "POST" })),
  hide: (id: string) => unwrap(apiRequest<ApiResponse<Warehouse>>(`/warehouses/${id}`, { method: "DELETE" })),
};

export const locationApi = {
  list: (params: ListParams & { warehouse_id?: string } = {}) =>
    apiRequest<PaginatedResponse<Location>>("/locations", { params }),
  get: (id: string) => unwrap(apiRequest<ApiResponse<Location>>(`/locations/${id}`)),
  create: (body: { warehouse_id: string; name: string; address?: string; capacity_units: number }) =>
    unwrap(apiRequest<ApiResponse<Location>>("/locations", { method: "POST", body })),
  update: (id: string, body: Partial<Pick<Location, "warehouse_id" | "name" | "address" | "capacity_units">>) =>
    unwrap(apiRequest<ApiResponse<Location>>(`/locations/${id}`, { method: "PATCH", body })),
  remove: (id: string) => apiRequest<void>(`/locations/${id}`, { method: "DELETE" }),
};

export const inventoryApi = {
  list: (params: ListParams & { product_id?: string; location_id?: string; low_stock?: "true" | "false" } = {}) =>
    apiRequest<PaginatedResponse<Inventory>>("/inventory", { params }),
  get: (id: string) => unwrap(apiRequest<ApiResponse<Inventory>>(`/inventory/${id}`)),
  receive: (body: {
    product_id: string;
    location_id: string;
    movement_type: "INCOMING";
    quantity: number;
    unit_cost: number;
    lot_code?: string;
    reason?: string;
  }) => unwrap(apiRequest<ApiResponse<{ inventory: Inventory; lot: unknown; movement: StockMovement }>>("/inventory/receive", {
    method: "POST",
    body,
  })),
  transfer: (body: {
    product_id: string;
    from_location_id: string;
    to_location_id: string;
    quantity: number;
    reason?: string;
  }) => unwrap(apiRequest<ApiResponse<{ movement: StockMovement; transferred_quantity: number }>>("/inventory/transfer", {
    method: "POST",
    body,
  })),
  sell: (body: { product_id: string; location_id: string; quantity: number; reason?: string }) =>
    unwrap(apiRequest<ApiResponse<{ inventory: Inventory; movement: StockMovement; sold_quantity: number }>>("/inventory/sell", {
      method: "POST",
      body,
    })),
  reserve: (id: string, quantity: number, ttl_minutes = 30) =>
    unwrap(apiRequest<ApiResponse<{ inventory: Inventory; reservation: unknown }>>(`/inventory/${id}/reserve`, {
      method: "POST",
      body: { quantity, ttl_minutes },
    })),
  releaseReservation: (id: string, quantity: number, reservation_id?: string) =>
    unwrap(apiRequest<ApiResponse<Inventory>>(`/inventory/${id}/release-reservation`, {
      method: "POST",
      body: { quantity, reservation_id },
    })),
};

export const stockMovementApi = {
  list: (params: ListParams & {
    movement_type?: StockMovement["movement_type"];
    status?: StockMovement["status"];
    product_id?: string;
    location_id?: string;
    user_id?: string;
  } = {}) => apiRequest<PaginatedResponse<StockMovement>>("/stock-movements", { params }),
  get: (id: string) => unwrap(apiRequest<ApiResponse<StockMovement>>(`/stock-movements/${id}`)),
};

export const supplierApi = {
  list: (params: ListParams & { is_active?: "true" | "false" } = {}) =>
    apiRequest<PaginatedResponse<Supplier>>("/suppliers", { params }),
  get: (id: string) => unwrap(apiRequest<ApiResponse<Supplier>>(`/suppliers/${id}`)),
  create: (body: {
    name: string;
    contact_email?: string;
    phone?: string;
    lead_time_days: number;
    products?: Array<{ product_id: string; supplier_sku?: string; unit_cost: number; min_order_quantity?: number }>;
  }) => unwrap(apiRequest<ApiResponse<Supplier>>("/suppliers", { method: "POST", body })),
  update: (id: string, body: Partial<{
    name: string;
    contact_email: string;
    phone: string;
    lead_time_days: number;
  }>) => unwrap(apiRequest<ApiResponse<Supplier>>(`/suppliers/${id}`, { method: "PATCH", body })),
  deactivate: (id: string) => unwrap(apiRequest<ApiResponse<Supplier>>(`/suppliers/${id}`, { method: "DELETE" })),
};

export const purchaseOrderApi = {
  list: (params: ListParams & { status?: PurchaseOrder["status"]; supplier_id?: string } = {}) =>
    apiRequest<PaginatedResponse<PurchaseOrder>>("/purchase-orders", { params }),
  get: (id: string) => unwrap(apiRequest<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`)),
  create: (body: {
    supplier_id: string;
    expected_at?: string;
    notes?: string;
    lines: Array<{ product_id: string; location_id: string; quantity_ordered: number; unit_cost: number }>;
  }) => unwrap(apiRequest<ApiResponse<PurchaseOrder>>("/purchase-orders", { method: "POST", body })),
  submit: (id: string) => unwrap(apiRequest<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/submit`, { method: "POST" })),
  approve: (id: string) => unwrap(apiRequest<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/approve`, { method: "POST" })),
  receive: (id: string, body: { lines: Array<{ line_id: string; quantity_received: number; lot_code?: string }> }) =>
    unwrap(apiRequest<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/receive`, { method: "POST", body })),
  cancel: (id: string) => unwrap(apiRequest<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/cancel`, { method: "POST" })),
};

export const reportApi = {
  deadStock: (threshold_days = 30) =>
    unwrap(apiRequest<ApiResponse<{ dead_stock_lots: DeadStockLot[]; count: number }>>("/reports/dead-stock", {
      params: { threshold_days },
    })),
  lowStock: () => unwrap(apiRequest<ApiResponse<{ low_stock_items: Inventory[]; count: number }>>("/reports/low-stock")),
  reorderForecast: (params: { product_id?: string; location_id?: string; days?: number; lead_time_days?: number } = {}) =>
    unwrap(apiRequest<ApiResponse<{ suggestions: ReorderForecast[]; count: number }>>("/reports/reorder-forecast", { params })),
  decayHistory: (params: { product_id?: string; location_id?: string } = {}) =>
    unwrap(apiRequest<ApiResponse<DecayAudit[]>>("/reports/decay-history", { params })),
  triggerDecay: (params: { sync?: boolean; threshold_days?: number } = {}) =>
    unwrap(apiRequest<ApiResponse<{ message: string; job?: JobStatus; processed?: number; skipped?: number; total?: number }>>(
      "/reports/trigger-decay",
      {
        method: "POST",
        params: { mode: params.sync ? "sync" : undefined, threshold_days: params.threshold_days },
        body: params.threshold_days ? { threshold_days: params.threshold_days } : {},
      },
    )),
};

export const jobApi = {
  get: (id: string) => unwrap(apiRequest<ApiResponse<JobStatus>>(`/jobs/${id}`)),
};
