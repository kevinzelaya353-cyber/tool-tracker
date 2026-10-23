import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/** Configuración común de las cachés de datos de la app. */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // No reintentar errores de negocio/permiso; sí fallos de red o del servidor.
        retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      },
      mutations: { retry: false },
    },
  });
}
