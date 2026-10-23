import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PasswordResetInput, UserCreateInput, UserUpdateInput } from "@tt/shared";
import { api } from "@/lib/api";
import type { AccountStatus, ManagedUser } from "@/types/api";
import { catalogKeys } from "../catalog/api";

const keys = { all: ["users", "managed"] as const, status: (id: string) => ["users", "status", id] as const };

/** Todas las cuentas y personas, incluidas las inactivas (solo quien gestiona usuarios). */
export const useManagedUsers = (enabled = true) =>
  useQuery({ queryKey: keys.all, enabled, queryFn: () => api.get<ManagedUser[]>("/api/users", { includeInactive: "true" }) });

/** Estado de la cuenta: bloqueo, intentos, último ingreso y sesiones abiertas. */
export const useAccountStatus = (id?: string) =>
  useQuery({ queryKey: keys.status(id ?? ""), enabled: Boolean(id), queryFn: () => api.get<AccountStatus>(`/api/users/${id}`) });

function useInvalidate() {
  const qc = useQueryClient();
  // También la lista de "entregado/recibido por" de los traslados.
  return () => {
    void qc.invalidateQueries({ queryKey: ["users"] });
    return qc.invalidateQueries({ queryKey: catalogKeys.users });
  };
}

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UserCreateInput) => api.post<ManagedUser>("/api/users", input),
    onSuccess: invalidate,
  });
}

export function useUpdateUser(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UserUpdateInput) => api.patch<ManagedUser>(`/api/users/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useResetPassword(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: PasswordResetInput) => api.post<AccountStatus>(`/api/users/${id}/reset-password`, input),
    onSuccess: invalidate,
  });
}

export function useRevokeSessions(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<AccountStatus>(`/api/users/${id}/revoke-sessions`),
    onSuccess: invalidate,
  });
}

export function useDeleteUser(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => api.del(`/api/users/${id}`), onSuccess: invalidate });
}
