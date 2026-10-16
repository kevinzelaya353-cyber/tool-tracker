import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TransferCreateInput } from "@tt/shared";
import { api } from "@/lib/api";
import type { Page, TransferDetail, TransferSummary } from "@/types/api";
import { toolKeys } from "../tools/api";

export const transferKeys = {
  all: ["transfers"] as const,
  list: ["transfers", "list"] as const,
  detail: (id: string) => ["transfers", "detail", id] as const,
};

export const useTransfersInfinite = () =>
  useInfiniteQuery({
    queryKey: transferKeys.list,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Page<TransferSummary>>("/api/transfers", { page: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

export const useTransfer = (id: string) =>
  useQuery({ queryKey: transferKeys.detail(id), queryFn: () => api.get<TransferDetail>(`/api/transfers/${id}`) });

/** El payload usa fecha como string ISO; la API la convierte. */
export type TransferPayload = Omit<TransferCreateInput, "movedAt"> & { movedAt: string };

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferPayload) => api.post<TransferDetail>("/api/transfers", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: transferKeys.all });
      qc.invalidateQueries({ queryKey: toolKeys.all });
      qc.invalidateQueries({ queryKey: ["reports", "summary"] }); // conteo por estado
    },
  });
}
