import { useInfiniteQuery } from "@tanstack/react-query";
import type { AuditQuery } from "@tt/shared";
import { api } from "@/lib/api";
import type { AuditEntry, Page } from "@/types/api";

export type AuditFilters = Partial<Omit<AuditQuery, "page" | "pageSize">>;

/**
 * Auditoría: `global` (SuperAdmin sin organización elegida) consulta todas las organizaciones;
 * si no, la de la organización actual (la API nunca devuelve otra).
 */
export const useAudit = (filters: AuditFilters, global: boolean) =>
  useInfiniteQuery({
    queryKey: ["audit", global ? "global" : "org", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Page<AuditEntry>>(global ? "/api/platform/audit" : "/api/audit", {
        ...filters,
        from: filters.from?.toISOString(),
        to: filters.to?.toISOString(),
        page: pageParam,
        pageSize: 50,
      }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
