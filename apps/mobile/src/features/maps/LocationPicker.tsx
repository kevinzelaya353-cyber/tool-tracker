import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { ModalSafeArea } from "@/components/ui/ModalSafeArea";
import { makeStyles, radius, space, useTheme } from "@/theme";
import { leafletHtml, type LatLng } from "./leaflet-html";
import { LeafletView } from "./LeafletView";

interface Props {
  label?: string;
  value: LatLng | null;
  onChange(value: LatLng | null): void;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** GPS del dispositivo; devuelve un mensaje de error en lugar de lanzar. */
async function currentPoint(): Promise<LatLng | string> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return "Permiso de ubicación denegado. Puedes marcar el punto tocando el mapa.";
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
  } catch {
    return "No se pudo obtener la ubicación. Marca el punto tocando el mapa.";
  }
}

/**
 * Punto en el mapa de un proyecto o bodega. En el formulario solo hay una vista previa: el mapa
 * para marcar se abre a pantalla completa, porque dentro de un ScrollView (Android) el desplazamiento
 * del formulario se queda con los toques y arrastres y el mapa nunca recibe el "click".
 */
export function LocationPicker({ label = "Ubicación en el mapa", value, onChange }: Props) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const preview = useMemo(
    () => (value ? leafletHtml({ markers: [{ ...value, label: "Punto marcado", color: colors.primary }] }) : null),
    [value, colors.primary],
  );

  const useGps = async () => {
    setGpsError(null);
    setLocating(true);
    const p = await currentPoint();
    setLocating(false);
    if (typeof p === "string") setGpsError(p);
    else onChange(p);
  };

  return (
    <View style={styles.wrap}>
      <Text style={font.label}>{label}</Text>
      {preview ? (
        // Sin toques: la vista previa no debe competir con el desplazamiento del formulario.
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Cambiar el punto en el mapa">
          <View pointerEvents="none">
            <LeafletView html={preview} height={180} />
          </View>
        </Pressable>
      ) : (
        <Pressable style={styles.empty} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Marcar en el mapa">
          <Ionicons name="map-outline" size={28} color={colors.textMuted} />
          <Text style={font.small}>Sin punto marcado. Toca para abrir el mapa.</Text>
        </Pressable>
      )}
      {value ? <Text style={font.small}>{`${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`}</Text> : null}
      {gpsError ? <Text style={[font.small, { color: colors.danger }]}>{gpsError}</Text> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title={value ? "Cambiar en el mapa" : "Marcar en el mapa"} icon="map-outline" variant="secondary" compact onPress={() => setOpen(true)} />
        </View>
        <View style={styles.flex}>
          <Button title="Usar mi ubicación" icon="locate-outline" variant="secondary" compact loading={locating} onPress={useGps} />
        </View>
      </View>
      {value ? <Button title="Quitar punto" variant="ghost" compact onPress={() => onChange(null)} /> : null}

      {open ? (
        <MapPickerModal
          initial={value}
          onClose={() => setOpen(false)}
          onConfirm={(p) => {
            onChange(p);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** Mapa a pantalla completa: tocar coloca el punto; se guarda al confirmar. */
function MapPickerModal({ initial, onClose, onConfirm }: { initial: LatLng | null; onClose(): void; onConfirm(p: LatLng): void }) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const [point, setPoint] = useState(initial);
  // El mapa solo se reconstruye cuando el punto cambia desde fuera (GPS);
  // al tocarlo, Leaflet mueve el marcador sin recargar ni perder el zoom.
  const [seed, setSeed] = useState(initial);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const html = useMemo(() => leafletHtml({ pick: { initial: seed, color: colors.primary } }), [seed, colors.primary]);

  const onMessage = useCallback((data: unknown) => {
    const d = data as { type?: string; lat?: number; lng?: number };
    if (d.type === "pick" && typeof d.lat === "number" && typeof d.lng === "number") {
      setPoint({ lat: round(d.lat), lng: round(d.lng) });
    }
  }, []);

  const useGps = async () => {
    setGpsError(null);
    setLocating(true);
    const p = await currentPoint();
    setLocating(false);
    if (typeof p === "string") return setGpsError(p);
    setPoint(p);
    setSeed(p);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <ModalSafeArea style={styles.modal}>
        <View style={styles.header}>
          <Text style={[font.h2, styles.flex]}>Marca el punto</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar mapa">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.map}>
          <LeafletView html={html} onMessage={onMessage} />
        </View>
        <View style={styles.footer}>
          <Text style={font.small}>
            {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : "Toca el mapa donde está el proyecto o la bodega. Puedes acercar con dos dedos."}
          </Text>
          {gpsError ? <Text style={[font.small, { color: colors.danger }]}>{gpsError}</Text> : null}
          <Button title="Usar mi ubicación" icon="locate-outline" variant="secondary" compact loading={locating} onPress={useGps} />
          <Button title="Usar este punto" icon="checkmark" disabled={!point} onPress={() => point && onConfirm(point)} />
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.xs },
    row: { flexDirection: "row", gap: space.sm },
    flex: { flex: 1 },
    empty: {
      height: 120,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: colors.neutralSoft,
      alignItems: "center",
      justifyContent: "center",
      gap: space.xs,
    },
    modal: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
    map: { flex: 1, paddingHorizontal: space.sm },
    footer: { padding: space.lg, gap: space.sm },
  }),
);
