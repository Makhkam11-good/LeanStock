import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../auth/tokenStore";
import type { ApiErrorBody, ApiResponse, RefreshResponse } from "../types/api";

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;

  if (configured && configured.startsWith("http") && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const { origin, protocol, hostname } = window.location;

    if (configured?.startsWith("/")) {
      return `${origin}${configured}`.replace(/\/$/, "");
    }

    if (!hostname.includes("localhost") && hostname !== "127.0.0.1") {
      return `${origin}/api/v1`;
    }

    if (hostname.includes("-frontend")) {
      return `${protocol}//${hostname.replace("-frontend", "-api")}/api/v1`;
    }

    if (hostname.includes("frontend")) {
      return `${protocol}//${hostname.replace("frontend", "api")}/api/v1`;
    }
  }

  return (configured ?? "http://localhost:3000/api/v1").replace(/\/$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiErrorBody["details"];

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? "REQUEST_FAILED";
    this.details = body?.details;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
  params?: object;
};

let refreshPromise: Promise<RefreshResponse> | null = null;

function buildUrl(path: string, params?: RequestOptions["params"]) {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, payload?.error);
  }

  return payload as T;
}

async function refreshTokens() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError(401, { code: "UNAUTHORIZED", message: "Session expired" });

  if (!refreshPromise) {
    refreshPromise = fetch(buildUrl("/auth/refresh-token"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then((response) => parseResponse<ApiResponse<RefreshResponse>>(response))
      .then((payload) => {
        setTokens(payload.data.access_token, payload.data.refresh_token);
        return payload.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, retry = true, params, headers, ...init } = options;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const accessToken = getAccessToken();
    if (accessToken) requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers: requestHeaders,
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth && retry) {
    try {
      await refreshTokens();
      return apiRequest<T>(path, { ...options, retry: false });
    } catch (error) {
      clearTokens();
      throw error;
    }
  }

  return parseResponse<T>(response);
}

export function unwrap<T>(promise: Promise<ApiResponse<T>>) {
  return promise.then((response) => response.data);
}
