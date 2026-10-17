import * as Location from "expo-location";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { space, useTheme } from "@/theme";
import { leafletHtml, type LatLng } from "./leaflet-html";
import { LeafletView } from "./LeafletView";

interface Props {
  label?: string;
  value: LatLng | null;
  onChange(value: LatLng | null): void;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Toca el mapa para marcar el punto, o usa el GPS del dispositivo. */
export function LocationPicker({ label = "Ubicación en el mapa", value, onChange }: Props) {
  const { colors, font } = useTheme();
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // El mapa solo se reconstruye cuando el punto cambia desde fuera (GPS o quitar);
  // al tocarlo, Leaflet mueve el marcador sin recargar ni perder el zoom.
  const [seed, setSeed] = useState(value);
  const html = useMemo(() => leafletHtml({ pick: { initial: seed, color: colors.primary } }), [seed, colors.primary]);

  const onMessage = useCallback(
    (data: unknown) => {
      const d = data as { type?: string; lat?: number; lng?: number };
      if (d.type === "pick" && typeof d.lat === "number" && typeof d.lng === "number") {
        onChange({ lat: round(d.lat), lng: round(d.lng) });
      }
    },
    [onChange],
  );

  const useGps = async () => {
    setGpsError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setGpsError("Permiso de ubicación denegado. Puedes marcar el punto tocando el mapa.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
      onChange(p);
      setSeed(p);
    } catch {
      setGpsError("No se pudo obtener la ubicación. Marca el punto tocando el mapa.");
    } finally {
      setLocating(false);
    }
  };

  const clear = () => {
    onChange(null);
    setSeed(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={font.label}>{label}</Text>
      <LeafletView html={html} height={280} onMessage={onMessage} />
      <Text style={font.small}>
        {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : "Toca el mapa para marcar el punto exacto."}
      </Text>
      {gpsError ? <Text style={[font.small, { color: colors.danger }]}>{gpsError}</Text> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title="Usar mi ubicación" icon="locate-outline" variant="secondary" compact loading={locating} onPress={useGps} />
        </View>
        {value ? (
          <View style={styles.flex}>
            <Button title="Quitar punto" variant="ghost" compact onPress={clear} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
});
