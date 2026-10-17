import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryCreateInput, LocationCreateInput, LocationType, VehicleCreateInput } from "@tt/shared";
import { api } from "@/lib/api";
import type { Category, Location, UserLite, Vehicle } from "@/types/api";

// Los catálogos cambian poco: se cachean 5 minutos.
const STALE = 5 * 60_000;

export const catalogKeys = {
  locations: (type?: LocationType) => ["locations", type ?? "all"] as const,
  vehicles: ["vehicles"] as const,
  categories: ["categories"] as const,
  users: ["users"] as const,
};

export const useLocations = (type?: LocationType) =>
  useQuery({
    queryKey: catalogKeys.locations(type),
    queryFn: () => api.get<Location[]>("/api/locations", { type }),
    staleTime: STALE,
  });

export const useVehicles = () =>
  useQuery({ queryKey: catalogKeys.vehicles, queryFn: () => api.get<Vehicle[]>("/api/vehicles"), staleTime: STALE });

export const useCategories = () =>
  useQuery({ queryKey: catalogKeys.categories, queryFn: () => api.get<Category[]>("/api/categories"), staleTime: STALE });

/** Crea un proyecto o bodega. Invalida todas las listas de ubicaciones (con y sin filtro de tipo). */
export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LocationCreateInput) => api.post<Location>("/api/locations", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleCreateInput) => api.post<Vehicle>("/api/vehicles", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.vehicles }),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) => api.post<Category>("/api/categories", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.categories }),
  });
}

export const useUsers = () =>
  useQuery({ queryKey: catalogKeys.users, queryFn: () => api.get<UserLite[]>("/api/users"), staleTime: STALE });
