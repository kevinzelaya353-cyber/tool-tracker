import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ToolCreateInput, ToolStatus } from "@tt/shared";
import { api } from "@/lib/api";
import type { HistoryEvent, Page, Tool, ToolDetail } from "@/types/api";

export interface ToolFilters {
  q?: string;
  status?: ToolStatus;
  locationId?: string;
  categoryId?: string;
}

export const toolKeys = {
  all: ["tools"] as const,
  list: (f: ToolFilters) => ["tools", "list", f] as const,
  detail: (id: string) => ["tools", "detail", id] as const,
  history: (id: string) => ["tools", "history", id] as const,
};

const PAGE_SIZE = 20;

export const useToolsInfinite = (filters: ToolFilters) =>
  useInfiniteQuery({
    queryKey: toolKeys.list(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Page<Tool>>("/api/tools", { ...filters, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

/** Todas las herramientas de una ubicación (para el wizard de traslado; máx. 100 por página de API). */
export const useToolsAtLocation = (locationId?: string) =>
  useQuery({
    queryKey: toolKeys.list({ locationId }),
    enabled: !!locationId,
    queryFn: async () => {
      const out: Tool[] = [];
      for (let page = 1; ; page++) {
        const res = await api.get<Page<Tool>>("/api/tools", { locationId, page, pageSize: 100 });
        out.push(...res.data);
        if (page * res.pageSize >= res.total) return out;
      }
    },
  });

export const useTool = (id: string) =>
  useQuery({ queryKey: toolKeys.detail(id), queryFn: () => api.get<ToolDetail>(`/api/tools/${id}`) });

export const useToolHistory = (id: string) =>
  useQuery({ queryKey: toolKeys.history(id), queryFn: () => api.get<HistoryEvent[]>(`/api/tools/${id}/history`) });

export const fetchToolByCode = (code: string) => api.get<ToolDetail>(`/api/tools/by-code/${encodeURIComponent(code)}`);

export function useCreateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToolCreateInput) => api.post<Tool>("/api/tools", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: toolKeys.all });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
