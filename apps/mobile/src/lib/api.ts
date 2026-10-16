import { secureStorage } from "./secure-storage";

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const REFRESH_KEY = "tt.refreshToken";

// El access token vive solo en memoria; el refresh token en el llavero/keystore del sistema.
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** Mensajes de detalle (violaciones de reglas o errores de validación) para mostrar al usuario. */
  get detailMessages(): string[] {
    if (!Array.isArray(this.details)) return [];
    return this.details
      .map((d) => (d && typeof d === "object" && "message" in d ? String((d as { message: unknown }).message) : ""))
      .filter(Boolean);
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const session = {
  async save(pair: TokenPair) {
    accessToken = pair.accessToken;
    await secureStorage.setItem(REFRESH_KEY, pair.refreshToken);
  },
  async clear() {
    accessToken = null;
    await secureStorage.deleteItem(REFRESH_KEY);
  },
  getRefreshToken: () => secureStorage.getItem(REFRESH_KEY),
  onExpired(cb: () => void) {
    onSessionExpired = cb;
  },
};

/** Renueva el access token. Varias peticiones concurrentes comparten una sola renovación. */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await session.getRefreshToken();
    if (!refreshToken) return false;
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      throw new ApiError(0, "NETWORK", "Sin conexión con el servidor");
    }
    if (!res.ok) {
      // Solo se descarta la sesión si el servidor la rechazó (no ante fallos de red).
      if (res.status === 401) await session.clear();
      return false;
    }
    await session.save((await res.json()) as TokenPair);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  form?: FormData;
  auth?: boolean;
}

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${path}?${qs}` : path;
}

export async function request<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const auth = opts.auth !== false;
  if (auth && !accessToken) await refresh();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // fetch pone el boundary del multipart
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${withQuery(path, opts.query)}`, { method: opts.method ?? "GET", headers, body });
  } catch {
    throw new ApiError(0, "NETWORK", "Sin conexión con el servidor");
  }

  if (res.status === 401 && auth && retry) {
    if (await refresh()) return request<T>(path, opts, false);
    onSessionExpired?.();
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? `HTTP_${res.status}`,
      data?.error?.message ?? "Error inesperado del servidor",
      data?.error?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown, opts: Pick<RequestOptions, "auth"> = {}) =>
    request<T>(path, { method: "POST", body, ...opts }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", form }),
};
