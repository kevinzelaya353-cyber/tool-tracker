import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OrganizationCreateInput,
  OrganizationUpdateInput,
  PlatformOverview,
  PlatformPasswordResetInput,
  PlatformUserCreateInput,
  PlatformUserListQuery,
  UserUpdateInput,
} from "@tt/shared";
import { usePlatformAccess } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import type { AccountStatus, Organization, Page, PlatformUser } from "@/types/api";

/**
 * Administración de la plataforma (solo SuperAdmin): la API las rechaza para cualquier otro rol.
 * Las consultas solo salen con acceso de plataforma: nunca desde una sesión de soporte ni otro rol
 * (evita peticiones denegadas, que además quedarían en la auditoría).
 */
export const platformKeys = {
  all: ["platform"] as const,
  overview: ["platform", "overview"] as const,
  orgs: ["platform", "organizations"] as const,
  org: (id: string) => ["platform", "organizations", id] as const,
  users: (q: Partial<PlatformUserListQuery>) => ["platform", "users", q] as const,
  user: (id: string) => ["platform", "user", id] as const,
};

export const usePlatformOverview = (enabled = true) =>
  useQuery({ queryKey: platformKeys.overview, enabled: usePlatformAccess() && enabled, queryFn: () => api.get<PlatformOverview>("/api/platform/overview") });

export const useOrganizations = (enabled = true) =>
  useQuery({ queryKey: platformKeys.orgs, enabled: usePlatformAccess() && enabled, queryFn: () => api.get<Organization[]>("/api/platform/organizations") });

export const useOrganization = (id?: string) =>
  useQuery({
    queryKey: platformKeys.org(id ?? ""),
    enabled: usePlatformAccess() && Boolean(id),
    queryFn: () => api.get<Organization>(`/api/platform/organizations/${id}`),
  });

export function useSaveOrganization(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationCreateInput | OrganizationUpdateInput) =>
      id ? api.patch<Organization>(`/api/platform/organizations/${id}`, input) : api.post<Organization>("/api/platform/organizations", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeys.all }),
  });
}

export const usePlatformUsers = (q: Partial<PlatformUserListQuery>, enabled = true) =>
  useQuery({
    queryKey: platformKeys.users(q),
    enabled: usePlatformAccess() && enabled,
    queryFn: () => api.get<Page<PlatformUser>>("/api/platform/users", { pageSize: 100, ...q }),
  });

export const usePlatformUser = (id: string) =>
  useQuery({
    queryKey: platformKeys.user(id),
    enabled: usePlatformAccess(),
    queryFn: () => api.get<AccountStatus & Pick<PlatformUser, "organization" | "organizationId">>(`/api/platform/users/${id}`),
  });

function useRefreshPlatform() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: platformKeys.all });
}

export function useCreatePlatformUser() {
  const refresh = useRefreshPlatform();
  return useMutation({
    mutationFn: (input: PlatformUserCreateInput) => api.post<PlatformUser>("/api/platform/users", input),
    onSuccess: refresh,
  });
}

/** Cambios de cuenta desde la plataforma. Para un SuperAdmin, `confirmPassword` es obligatoria. */
export function useUpdatePlatformUser(id: string) {
  const refresh = useRefreshPlatform();
  return useMutation({
    mutationFn: (input: UserUpdateInput | { name?: string; active?: boolean; confirmPassword: string }) =>
      api.patch<PlatformUser>(`/api/platform/users/${id}`, input),
    onSuccess: refresh,
  });
}

export function useResetPlatformPassword(id: string) {
  const refresh = useRefreshPlatform();
  return useMutation({
    mutationFn: (input: PlatformPasswordResetInput) => api.post<AccountStatus>(`/api/platform/users/${id}/reset-password`, input),
    onSuccess: refresh,
  });
}

export function useRevokePlatformSessions(id: string) {
  const refresh = useRefreshPlatform();
  return useMutation({
    mutationFn: () => api.post<AccountStatus>(`/api/platform/users/${id}/revoke-sessions`),
    onSuccess: refresh,
  });
}
