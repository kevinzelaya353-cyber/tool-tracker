import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { radius, space, makeStyles, useTheme } from "@/theme";
import { discardPhoto, uploadPhotos, type LocalImage } from "../media/api";
import { compressImage } from "./compress";
import { currentSpot, type PhotoSpot } from "./photoLocation";
import { MultiPhotoCapture } from "./MultiPhotoCapture";

const MAX_PHOTOS = 20; // límite de photoIds por traslado/evento en la API
const BATCH = 5; // límite de archivos por petición en la API

type Item = LocalImage & { key: string; status: "uploading" | "done" | "error"; id?: string; spot?: Promise<PhotoSpot | null> };

interface Props {
  label?: string;
  hint?: string;
  /** Máximo de fotos (1 = foto única, p. ej. la de la herramienta). */
  max?: number;
  /** Recibe los ids de fotos ya subidas y si queda alguna subiendo. */
  onChange(ids: string[], uploading: boolean): void;
}

/**
 * Campo de fotos: se toman con la cámara o se eligen de la galería, se suben en
 * segundo plano por tandas y se entregan los ids para asociarlos al traslado, evento o herramienta.
 */
export function PhotoPicker({ label = "Evidencia fotográfica", hint, max = MAX_PHOTOS, onChange }: Props) {
  const styles = useStyles();
  const { font } = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const counter = useRef(0);
  const left = max - items.length;

  useEffect(() => {
    onChange(
      items.filter((i) => i.status === "done" && i.id).map((i) => i.id!),
      items.some((i) => i.status === "uploading"),
    );
  }, [items, onChange]);

  const upload = async (batch: Item[]) => {
    try {
      const res = await uploadPhotos(batch, await batch[0]?.spot);
      setItems((all) =>
        all.map((it) => {
          const idx = batch.findIndex((b) => b.key === it.key);
          return idx >= 0 ? { ...it, status: "done", id: res[idx]?.id } : it;
        }),
      );
    } catch {
      const keys = new Set(batch.map((b) => b.key));
      setItems((all) => all.map((it) => (keys.has(it.key) ? { ...it, status: "error" } : it)));
    }
  };

  /** `atHere`: recién tomadas con la cámara (de la galería pudieron tomarse en otro lugar). */
  const add = (images: LocalImage[], atHere = true) => {
    setCameraOpen(false);
    // Una sola lectura de GPS por tanda: todas se tomaron en el mismo lugar.
    const spot = atHere ? currentSpot() : undefined;
    const fresh: Item[] = images.map((img) => ({ ...img, key: `p${counter.current++}`, status: "uploading", spot }));
    setItems((all) => [...all, ...fresh]);
    for (let i = 0; i < fresh.length; i += BATCH) void upload(fresh.slice(i, i + BATCH));
  };

  /** Directo a la carpeta de imágenes, sin pasar por la cámara. */
  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: left > 1,
      selectionLimit: left,
      quality: 1,
    });
    if (res.canceled) return;
    setPicking(true);
    try {
      add(await Promise.all(res.assets.slice(0, left).map((a) => compressImage(a))), false);
    } finally {
      setPicking(false);
    }
  };

  const retry = (item: Item) => {
    setItems((all) => all.map((it) => (it.key === item.key ? { ...it, status: "uploading" } : it)));
    void upload([item]);
  };

  const remove = (item: Item) => {
    setItems((all) => all.filter((it) => it.key !== item.key));
    if (item.id) discardPhoto(item.id).catch(() => undefined); // si falla, la API la purga a las 24 h
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={font.label}>{label}</Text>
        {max > 1 ? (
          <Text style={font.small}>
            {items.length}/{max}
          </Text>
        ) : null}
      </View>
      {hint ? <Text style={font.small}>{hint}</Text> : null}

      {items.length > 0 ? (
        <View style={styles.grid}>
          {items.map((it) => (
            <View key={it.key} style={styles.cell}>
              <Image source={{ uri: it.uri }} style={styles.img} />
              {it.status === "uploading" ? (
                <View style={styles.overlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : it.status === "error" ? (
                <Pressable style={[styles.overlay, styles.errorOverlay]} onPress={() => retry(it)} accessibilityLabel="Reintentar subida">
                  <Ionicons name="refresh" size={22} color="#fff" />
                  <Text style={styles.retry}>Reintentar</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.remove} onPress={() => remove(it)} hitSlop={8} accessibilityLabel="Quitar foto">
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {left > 0 ? (
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button title="Cámara" icon="camera-outline" variant="secondary" onPress={() => setCameraOpen(true)} />
          </View>
          <View style={styles.flex}>
            <Button title="Galería" icon="images-outline" variant="secondary" loading={picking} onPress={pickFromGallery} />
          </View>
        </View>
      ) : null}

      <MultiPhotoCapture visible={cameraOpen} remaining={left} onClose={() => setCameraOpen(false)} onDone={(images) => add(images)} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    header: { flexDirection: "row", justifyContent: "space-between" },
    buttons: { flexDirection: "row", gap: space.sm },
    flex: { flex: 1 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    cell: { width: "31%", maxWidth: 120, aspectRatio: 1 }, // tres por fila en el teléfono; miniaturas en web
    img: { width: "100%", height: "100%", borderRadius: radius.md, backgroundColor: colors.neutralSoft },
    overlay: {
      ...StyleSheet.absoluteFill,
      borderRadius: radius.md,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    errorOverlay: { backgroundColor: "rgba(220, 38, 38, 0.75)", gap: 2 },
    retry: { color: "#fff", fontSize: 12, fontWeight: "700" },
    remove: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(15,23,42,0.8)",
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
