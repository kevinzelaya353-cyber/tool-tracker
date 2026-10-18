import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDeletePhoto, usePhotoUrls } from "@/features/media/api";
import { confirmAsync, notify } from "@/lib/dialogs";
import { radius, space, makeStyles } from "@/theme";

/** Miniaturas de evidencia; al tocar una se abre a tamaño completo y, con permiso, se puede eliminar. */
export function PhotoStrip({ ids }: { ids: string[] }) {
  const styles = useStyles();
  const thumbs = usePhotoUrls(ids, "thumb");
  const [openId, setOpenId] = useState<string | null>(null);
  const full = usePhotoUrls(openId ? [openId] : [], "full");
  const { can } = useAuth();
  const canDelete = can("transfers:create") || can("lifecycle:create") || can("tools:write");
  const del = useDeletePhoto();
  if (ids.length === 0) return null;

  const onDelete = async (id: string) => {
    const ok = await confirmAsync(
      "¿Eliminar esta foto?",
      "Dejará de verse en la app. En el reporte de Excel se conserva como parte del historial.",
      { confirmText: "Eliminar", destructive: true },
    );
    if (!ok) return;
    del.mutate(id, {
      onSuccess: () => setOpenId(null),
      onError: (e) => notify("No se pudo eliminar la foto", e instanceof Error ? e.message : undefined),
    });
  };

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {ids.map((id) => (
          <Pressable key={id} onPress={() => setOpenId(id)} accessibilityLabel="Ver foto">
            {thumbs.data?.[id] ? (
              <Image source={{ uri: thumbs.data[id] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.placeholder]} />
            )}
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!openId} transparent animationType="fade" onRequestClose={() => setOpenId(null)}>
        <SafeAreaView style={styles.viewer}>
          <View style={styles.bar}>
            {canDelete && openId ? (
              <Pressable
                style={styles.delete}
                onPress={() => onDelete(openId)}
                disabled={del.isPending}
                hitSlop={12}
                accessibilityLabel="Eliminar foto"
              >
                {del.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons name="trash-outline" size={24} color="#fff" />}
                <Text style={styles.deleteText}>Eliminar</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable style={styles.close} onPress={() => setOpenId(null)} hitSlop={12} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
          </View>
          {openId && full.data?.[openId] ? (
            <Image source={{ uri: full.data[openId] }} style={styles.full} resizeMode="contain" />
          ) : (
            <ActivityIndicator color="#fff" style={styles.full} />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    strip: { gap: space.sm },
    thumb: { width: 72, height: 72, borderRadius: radius.sm },
    placeholder: { backgroundColor: colors.neutralSoft },
    viewer: { flex: 1, backgroundColor: "#000" },
    bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    close: { padding: space.lg },
    delete: { flexDirection: "row", alignItems: "center", gap: space.xs, padding: space.lg },
    deleteText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    full: { flex: 1 },
  }),
);
