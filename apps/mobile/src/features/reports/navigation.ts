import { router } from "expo-router";
import type { DetailParams } from "./api";

/** Abre el detalle de una cifra del tablero. Los filtros viajan en la URL (se puede volver atrás y compartir). */
export function openReportDetail(title: string, params: DetailParams) {
  const query = Object.fromEntries(
    Object.entries({ title, ...params }).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Record<string, string>;
  router.push({ pathname: "/report/detail", params: query });
}
