import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Permission } from "@tt/shared";
import { api, ApiError, session, type TokenPair } from "@/lib/api";
import { setCurrency } from "@/lib/format";
import { secureStorage } from "@/lib/secure-storage";
import type { SessionUser } from "@/types/api";

type Status = "loading" | "signedOut" | "signedIn";

/** Organización en la que opera el SuperAdmin (no lo asigna a ella: solo elige dónde trabajar). */
export interface OrgContext {
  id: string;
  name: string;
  currency: string;
}

interface AuthContextValue {
  status: Status;
  /** Usuario con cuyos permisos se trabaja (en una sesión de soporte, el impersonado). */
  user: SessionUser | null;
  /** SuperAdmin detrás de una sesión de soporte (null si no hay impersonación). */
  supportActor: SessionUser | null;
  isSuperadmin: boolean;
  /** Organización elegida por el SuperAdmin para operar (null: vista de plataforma). */
  org: OrgContext | null;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  can(permission: Permission): boolean;
  selectOrg(org: OrgContext | null): void;
  startImpersonation(userId: string, reason: string): Promise<void>;
  endImpersonation(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Antes de cambiar de contexto (organización o sesión de soporte) se vuelve al inicio, en el mismo
 * render: si no, la pantalla abierta se montaría otra vez en el contexto nuevo y pediría datos que
 * ya no le corresponden (y la API los rechazaría, dejando accesos denegados en la auditoría).
 */
function goHome() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate("/");
}
const ORG_KEY = "tt.orgContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [supportActor, setSupportActor] = useState<SessionUser | null>(null);
  const [org, setOrg] = useState<OrgContext | null>(null);

  const signOutLocal = useCallback(() => {
    setUser(null);
    setSupportActor(null);
    setOrg(null);
    setStatus("signedOut");
    queryClient.clear();
  }, [queryClient]);

  const applyOrg = useCallback((next: OrgContext | null) => {
    session.setOrgContext(next?.id ?? null);
    setOrg(next);
    void (next ? secureStorage.setItem(ORG_KEY, JSON.stringify(next)) : secureStorage.deleteItem(ORG_KEY));
  }, []);

  // Al terminar (o vencer) una sesión de soporte se vuelve a la del SuperAdmin.
  const restoreActor = useCallback(
    (actor: SessionUser | null) => {
      goHome();
      session.endImpersonation();
      setSupportActor(null);
      if (actor) setUser(actor);
      queryClient.clear();
    },
    [queryClient],
  );

  // Al abrir la app: si hay refresh token guardado, se restaura la sesión.
  useEffect(() => {
    session.onExpired(signOutLocal);
    (async () => {
      if (!(await session.getRefreshToken())) return setStatus("signedOut");
      try {
        const me = await api.get<SessionUser>("/api/auth/me");
        if (me.role === "SUPERADMIN") {
          const saved = await secureStorage.getItem(ORG_KEY);
          if (saved) applyOrg(JSON.parse(saved) as OrgContext);
        }
        setUser(me);
        setStatus("signedIn");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await session.clear();
        setStatus("signedOut");
      }
    })();
  }, [signOutLocal, applyOrg]);

  useEffect(() => {
    session.onImpersonationEnded(() => restoreActor(supportActor));
  }, [restoreActor, supportActor]);

  // Los montos se muestran en la moneda de la organización con la que se está trabajando.
  useEffect(() => {
    setCurrency(user?.organization?.currency ?? org?.currency);
  }, [user, org]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<TokenPair & { user: SessionUser }>("/api/auth/login", { username, password }, { auth: false });
    await session.save(res);
    setUser(res.user);
    setStatus("signedIn");
  }, []);

  const logout = useCallback(async () => {
    if (session.isImpersonating()) await api.post("/api/auth/impersonation/end").catch(() => undefined);
    session.endImpersonation();
    const refreshToken = await session.getRefreshToken();
    if (refreshToken) await api.post("/api/auth/logout", { refreshToken }, { auth: false }).catch(() => undefined);
    await session.clear();
    await secureStorage.deleteItem(ORG_KEY);
    signOutLocal();
  }, [signOutLocal]);

  const selectOrg = useCallback(
    (next: OrgContext | null) => {
      goHome();
      applyOrg(next);
      // Ningún dato de otra organización queda en caché.
      queryClient.clear();
    },
    [applyOrg, queryClient],
  );

  const startImpersonation = useCallback(
    async (userId: string, reason: string) => {
      const res = await api.post<{ accessToken: string; user: SessionUser }>("/api/platform/impersonations", { userId, reason });
      goHome();
      setSupportActor(user);
      session.startImpersonation(res.accessToken);
      queryClient.clear();
      setUser(res.user);
    },
    [user, queryClient],
  );

  const endImpersonation = useCallback(async () => {
    await api.post("/api/auth/impersonation/end").catch(() => undefined);
    restoreActor(supportActor);
  }, [restoreActor, supportActor]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api.post<TokenPair & { user: SessionUser }>("/api/auth/change-password", { currentPassword, newPassword });
    await session.save(res);
    setUser(res.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      supportActor,
      isSuperadmin: user?.role === "SUPERADMIN",
      org: user?.role === "SUPERADMIN" ? org : null,
      login,
      logout,
      can: (p) => user?.permissions.includes(p) ?? false,
      selectOrg,
      startImpersonation,
      endImpersonation,
      changePassword,
    }),
    [status, user, supportActor, org, login, logout, selectOrg, startImpersonation, endImpersonation, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

/**
 * ¿Hay una organización con la que trabajar? Siempre para los usuarios de una organización;
 * para el SuperAdmin, solo si eligió una.
 */
export function useHasOrg() {
  const { user, org } = useAuth();
  return Boolean(user?.organization || org);
}

/** ¿Puede pedir datos de la plataforma? Solo el SuperAdmin con su propia sesión (no en soporte). */
export function usePlatformAccess() {
  const { isSuperadmin, supportActor } = useAuth();
  return isSuperadmin && !supportActor;
}
