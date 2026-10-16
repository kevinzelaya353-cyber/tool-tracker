import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePhotoUrls } from "@/features/media/api";
import { radius, space, makeStyles } from "@/theme";

/** Miniaturas de evidencia; al tocar una se abre a tamaño completo. */
export function PhotoStrip({ ids }: { ids: string[] }) {
  const styles = useStyles();
  const thumbs = usePhotoUrls(ids, "thumb");
  const [openId, setOpenId] = useState<string | null>(null);
  const full = usePhotoUrls(openId ? [openId] : [], "full");
  if (ids.length === 0) return null;

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
          <Pressable style={styles.close} onPress={() => setOpenId(null)} hitSlop={12} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
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
    close: { alignSelf: "flex-end", padding: space.lg },
    full: { flex: 1 },
  }),
);
