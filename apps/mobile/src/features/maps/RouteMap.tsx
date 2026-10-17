import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { space, useTheme } from "@/theme";
import { leafletHtml, type LatLng } from "./leaflet-html";
import { LeafletView } from "./LeafletView";

interface Place {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface Props {
  from: Place;
  to: Place;
  route?: [number, number][] | null;
  distanceM?: number | null;
  durationS?: number | null;
  height?: number;
}

const point = (p: Place): LatLng | null =>
  p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null;

export const formatKm = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
export const formatDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const min = Math.round((s % 3600) / 60);
  return h ? `${h} h ${min} min` : `${min} min`;
};

/** Origen (verde) → destino (rojo) con el camino en azul. Si falta algún punto, explica qué hacer. */
export function RouteMap({ from, to, route, distanceM, durationS, height = 260 }: Props) {
  const { colors, font } = useTheme();
  const a = point(from);
  const b = point(to);
  const html = useMemo(
    () =>
      a && b
        ? leafletHtml({
            markers: [
              { ...a, label: from.name, color: "#16A34A" },
              { ...b, label: to.name, color: "#DC2626" },
            ],
            route,
          })
        : null,
    [a?.lat, a?.lng, b?.lat, b?.lng, from.name, to.name, route],
  );

  if (!html) {
    const missing = [!a && from.name, !b && to.name].filter(Boolean).join(" y ");
    return (
      <View style={[styles.empty, { backgroundColor: colors.neutralSoft }]}>
        <Text style={font.small}>
          Sin mapa: falta marcar en el mapa la ubicación de {missing}. Hazlo en Traslados › Proyectos y bodegas.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <LeafletView html={html} height={height} />
      {distanceM != null ? (
        <Text style={font.small}>
          {formatKm(distanceM)} por carretera{durationS ? ` · ~${formatDuration(durationS)} en vehículo` : ""}
        </Text>
      ) : (
        <Text style={font.small}>Ruta por carretera no disponible: se muestra la línea recta.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  empty: { padding: space.md, borderRadius: 8 },
});
