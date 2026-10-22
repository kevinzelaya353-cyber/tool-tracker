import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RentalCreateInput, RentalReturnInput, RentalStatus } from "@tt/shared";
import { api } from "@/lib/api";
import type { Page, RentalDetail, RentalSummary } from "@/types/api";
import { toolKeys } from "../tools/api";

export const rentalKeys = {
  all: ["rentals"] as const,
  list: (f: { status?: RentalStatus; toolId?: string }) => ["rentals", "list", f] as const,
  detail: (id: string) => ["rentals", "detail", id] as const,
};

export const useRentalsInfinite = (filter: { status?: RentalStatus; toolId?: string }) =>
  useInfiniteQuery({
    queryKey: rentalKeys.list(filter),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Page<RentalSummary>>("/api/rentals", { ...filter, page: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

/** Todos los períodos de alquiler de una herramienta (para su ficha). */
export const useToolRentals = (toolId: string, enabled = true) =>
  useQuery({
    queryKey: rentalKeys.list({ toolId }),
    enabled,
    queryFn: () => api.get<Page<RentalSummary>>("/api/rentals", { toolId, pageSize: 100 }).then((p) => p.data),
  });

export const useRental = (id: string) =>
  useQuery({ queryKey: rentalKeys.detail(id), queryFn: () => api.get<RentalDetail>(`/api/rentals/${id}`) });

/** Fechas como string ISO; la API las convierte. */
export type RentalPayload = Omit<RentalCreateInput, "receivedAt" | "expectedReturnAt"> & {
  receivedAt: string;
  expectedReturnAt?: string;
};
export type RentalReturnPayload = Omit<RentalReturnInput, "returnedAt"> & { returnedAt: string };

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: rentalKeys.all });
  qc.invalidateQueries({ queryKey: toolKeys.all });
  qc.invalidateQueries({ queryKey: ["reports"] });
};

/** Recepción (nuevo alquiler). El `id` lo genera el formulario: un reintento no duplica. */
export function useCreateRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RentalPayload) => api.post<RentalDetail>("/api/rentals", input),
    onSuccess: (data) => {
      qc.setQueryData(rentalKeys.detail(data.id), data);
      invalidate(qc);
    },
  });
}

/** Devolución al arrendador. Reenviar la misma devolución (reintento) responde con el alquiler ya cerrado. */
export function useReturnRental(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RentalReturnPayload) => api.post<RentalDetail>(`/api/rentals/${id}/return`, input),
    onSuccess: (data) => {
      qc.setQueryData(rentalKeys.detail(id), data);
      invalidate(qc);
    },
  });
}
