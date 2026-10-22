import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DamageReportCreateInput } from "@tt/shared";
import { api } from "@/lib/api";
import type { DamageReport } from "@/types/api";
import { toolKeys } from "../tools/api";

export const damageKeys = {
  forTool: (toolId: string) => ["tools", "damage-reports", toolId] as const,
};

/** Historial de daños de la herramienta (más reciente primero). */
export const useDamageReports = (toolId: string) =>
  useQuery({
    queryKey: damageKeys.forTool(toolId),
    queryFn: () => api.get<DamageReport[]>(`/api/tools/${toolId}/damage-reports`),
  });

/** El payload usa fecha como string ISO; la API la convierte. */
export type DamagePayload = Omit<DamageReportCreateInput, "occurredAt"> & { occurredAt: string };

/**
 * Registra un reporte de daño (o incidencia de alquiler). El `id` lo genera el formulario una sola
 * vez: si la red falla y se vuelve a enviar, la API devuelve el mismo reporte en vez de duplicarlo.
 */
export function useCreateDamageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DamagePayload) => api.post<DamageReport>("/api/damage-reports", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: toolKeys.all }); // estado, historial y daños de la herramienta
      qc.invalidateQueries({ queryKey: ["rentals"] }); // incidencias del alquiler
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
