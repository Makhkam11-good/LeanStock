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
    role?: Exclude<UserRole, "SYSTEM_ADMIN">;
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
  reserve: (id: string, quantity: number) =>
    unwrap(apiRequest<ApiResponse<Inventory>>(`/inventory/${id}/reserve`, { method: "POST", body: { quantity } })),
  releaseReservation: (id: string, quantity: number) =>
    unwrap(apiRequest<ApiResponse<Inventory>>(`/inventory/${id}/release-reservation`, {
      method: "POST",
      body: { quantity },
    })),
};

export const reportApi = {
  deadStock: (threshold_days = 30) =>
    unwrap(apiRequest<ApiResponse<{ dead_stock_lots: DeadStockLot[]; count: number }>>("/reports/dead-stock", {
      params: { threshold_days },
    })),
  lowStock: () => unwrap(apiRequest<ApiResponse<{ low_stock_items: Inventory[]; count: number }>>("/reports/low-stock")),
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
