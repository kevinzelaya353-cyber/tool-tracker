import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Permission } from "@tt/shared";
import { api, ApiError, session, type TokenPair } from "@/lib/api";
import type { SessionUser } from "@/types/api";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  user: SessionUser | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  can(permission: Permission): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  const signOutLocal = useCallback(() => {
    setUser(null);
    setStatus("signedOut");
    queryClient.clear();
  }, [queryClient]);

  // Al abrir la app: si hay refresh token guardado, se restaura la sesión.
  useEffect(() => {
    session.onExpired(signOutLocal);
    (async () => {
      if (!(await session.getRefreshToken())) return setStatus("signedOut");
      try {
        setUser(await api.get<SessionUser>("/api/auth/me"));
        setStatus("signedIn");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await session.clear();
        setStatus("signedOut");
      }
    })();
  }, [signOutLocal]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<TokenPair & { user: SessionUser }>("/api/auth/login", { email, password }, { auth: false });
    await session.save(res);
    setUser(res.user);
    setStatus("signedIn");
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await session.getRefreshToken();
    if (refreshToken) await api.post("/api/auth/logout", { refreshToken }, { auth: false }).catch(() => undefined);
    await session.clear();
    signOutLocal();
  }, [signOutLocal]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      can: (p) => user?.permissions.includes(p) ?? false,
    }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
