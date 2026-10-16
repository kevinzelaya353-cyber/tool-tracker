import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LifecycleEventCreateInput } from "@tt/shared";
import { api } from "@/lib/api";
import { toolKeys } from "../tools/api";

export type LifecyclePayload = Omit<LifecycleEventCreateInput, "occurredAt"> & { occurredAt: string };

export function useCreateLifecycleEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LifecyclePayload) => api.post("/api/lifecycle-events", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: toolKeys.all });
      qc.invalidateQueries({ queryKey: ["reports"] }); // daños, extravíos y costos cambian los reportes
    },
  });
}
