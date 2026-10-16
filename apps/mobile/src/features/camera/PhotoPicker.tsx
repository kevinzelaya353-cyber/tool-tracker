import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { radius, space, makeStyles, useTheme } from "@/theme";
import { discardPhoto, uploadPhotos, type LocalImage } from "../media/api";
import { MultiPhotoCapture } from "./MultiPhotoCapture";

const MAX_PHOTOS = 20; // límite de photoIds por traslado/evento en la API
const BATCH = 5; // límite de archivos por petición en la API

type Item = LocalImage & { key: string; status: "uploading" | "done" | "error"; id?: string };

interface Props {
  label?: string;
  /** Recibe los ids de fotos ya subidas y si queda alguna subiendo. */
  onChange(ids: string[], uploading: boolean): void;
}

/**
 * Campo de evidencia fotográfica: toma varias fotos, las sube en segundo plano
 * por tandas y entrega los ids para incluirlos en el traslado o evento.
 */
export function PhotoPicker({ label = "Evidencia fotográfica", onChange }: Props) {
  const styles = useStyles();
  const { font } = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    onChange(
      items.filter((i) => i.status === "done" && i.id).map((i) => i.id!),
      items.some((i) => i.status === "uploading"),
    );
  }, [items, onChange]);

  const upload = async (batch: Item[]) => {
    try {
      const res = await uploadPhotos(batch);
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

  const add = (images: LocalImage[]) => {
    setCameraOpen(false);
    const fresh: Item[] = images.map((img) => ({ ...img, key: `p${counter.current++}`, status: "uploading" }));
    setItems((all) => [...all, ...fresh]);
    for (let i = 0; i < fresh.length; i += BATCH) void upload(fresh.slice(i, i + BATCH));
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
        <Text style={font.small}>
          {items.length}/{MAX_PHOTOS}
        </Text>
      </View>

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

      <Button
        title={items.length ? "Agregar más fotos" : "Tomar fotos"}
        icon="camera-outline"
        variant="secondary"
        disabled={items.length >= MAX_PHOTOS}
        onPress={() => setCameraOpen(true)}
      />

      <MultiPhotoCapture
        visible={cameraOpen}
        remaining={MAX_PHOTOS - items.length}
        onClose={() => setCameraOpen(false)}
        onDone={add}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    header: { flexDirection: "row", justifyContent: "space-between" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    cell: { width: "31%", aspectRatio: 1 },
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
