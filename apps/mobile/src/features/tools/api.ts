import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ToolCreateInput, ToolOwnership, ToolStatus, ToolUpdateInput } from "@tt/shared";
import { api } from "@/lib/api";
import type { HistoryEvent, Page, Tool, ToolDetail } from "@/types/api";

export interface ToolFilters {
  q?: string;
  status?: ToolStatus;
  locationId?: string;
  categoryId?: string;
  ownership?: ToolOwnership;
}

export const toolKeys = {
  all: ["tools"] as const,
  list: (f: ToolFilters) => ["tools", "list", f] as const,
  byCategory: (f: ToolFilters) => ["tools", "by-category", f] as const,
  // Clave propia: con la de `list` chocaba con la lista paginada de la pestaña Herramientas
  // filtrada por ubicación (misma clave, datos { pages } en vez de un arreglo).
  atLocation: (locationId?: string) => ["tools", "at-location", locationId] as const,
  detail: (id: string) => ["tools", "detail", id] as const,
  history: (id: string) => ["tools", "history", id] as const,
};

const PAGE_SIZE = 20;

export const useToolsInfinite = (filters: ToolFilters, enabled = true) =>
  useInfiniteQuery({
    queryKey: toolKeys.list(filters),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Page<Tool>>("/api/tools", { ...filters, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

export interface CategoryCount {
  id: string;
  name: string;
  count: number;
}

/** Categorías con cuántas herramientas cumplen los filtros (para la vista agrupada). */
export const useToolCategoryCounts = (filters: Omit<ToolFilters, "categoryId">, enabled = true) =>
  useQuery({
    queryKey: toolKeys.byCategory(filters),
    enabled,
    queryFn: () => api.get<CategoryCount[]>("/api/tools/categories", { ...filters }),
  });

/** Todas las herramientas que cumplen los filtros, recorriendo las páginas (máx. 100 por página de API). */
export async function fetchAllTools(filters: ToolFilters): Promise<Tool[]> {
  const out: Tool[] = [];
  for (let page = 1; ; page++) {
    const res = await api.get<Page<Tool>>("/api/tools", { ...filters, page, pageSize: 100 });
    out.push(...res.data);
    if (page * res.pageSize >= res.total) return out;
  }
}

/** Todas las herramientas de una ubicación (para el wizard de traslado). */
export const useToolsAtLocation = (locationId?: string) =>
  useQuery({
    queryKey: toolKeys.atLocation(locationId),
    enabled: !!locationId,
    queryFn: () => fetchAllTools({ locationId }),
  });

export const useTool = (id: string, enabled = true) =>
  useQuery({ queryKey: toolKeys.detail(id), enabled: enabled && !!id, queryFn: () => api.get<ToolDetail>(`/api/tools/${id}`) });

export const useToolHistory = (id: string) =>
  useQuery({ queryKey: toolKeys.history(id), queryFn: () => api.get<HistoryEvent[]>(`/api/tools/${id}/history`) });

export const fetchToolByCode = (code: string) => api.get<ToolDetail>(`/api/tools/by-code/${encodeURIComponent(code)}`);

/** Cambia la foto propia de la herramienta (null la quita). */
export function useSetToolPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string | null) => api.put<Tool>(`/api/tools/${id}/photo`, { photoId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: toolKeys.all }),
  });
}

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

/** Edita los datos de la herramienta (incluida su categoría); solo se envían los campos cambiados. */
export function useUpdateTool(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToolUpdateInput) => api.patch<Tool>(`/api/tools/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: toolKeys.all });
      qc.invalidateQueries({ queryKey: ["reports"] }); // precio, fecha y categoría alimentan los reportes
    },
  });
}
