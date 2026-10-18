import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserCreateInput, UserUpdateInput } from "@tt/shared";
import { api } from "@/lib/api";
import type { ManagedUser } from "@/types/api";
import { catalogKeys } from "../catalog/api";

const keys = { all: ["users", "managed"] as const };

/** Todas las cuentas y personas, incluidas las inactivas (solo quien gestiona usuarios). */
export const useManagedUsers = () =>
  useQuery({ queryKey: keys.all, queryFn: () => api.get<ManagedUser[]>("/api/users", { includeInactive: "true" }) });

function useInvalidate() {
  const qc = useQueryClient();
  // También la lista de "entregado/recibido por" de los traslados.
  return () => qc.invalidateQueries({ queryKey: catalogKeys.users });
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
