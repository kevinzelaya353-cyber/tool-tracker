import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/Feedback";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useDeletePhoto, usePhotoUrls } from "@/features/media/api";
import { useSetToolPhoto } from "@/features/tools/api";
import { confirmAsync } from "@/lib/dialogs";
import { radius, space, makeStyles, useTheme } from "@/theme";

interface Props {
  toolId: string;
  photoId?: string | null;
  canEdit: boolean;
}

/** Foto propia de la herramienta; quien gestiona herramientas puede cambiarla (cámara o galería). */
export function ToolCoverPhoto({ toolId, photoId, canEdit }: Props) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const urls = usePhotoUrls(photoId ? [photoId] : [], "full");
  const setPhoto = useSetToolPhoto(toolId);
  const del = useDeletePhoto();
  const [editing, setEditing] = useState(false);

  const sent = useRef<string | null>(null);
  const { mutate } = setPhoto;

  // En cuanto la foto nueva termina de subir, se guarda como foto de la herramienta (una vez por foto).
  const onPhoto = useCallback(
    (ids: string[], busy: boolean) => {
      const id = ids[0];
      if (busy || !id || sent.current === id) return;
      sent.current = id;
      mutate(id, { onSuccess: () => setEditing(false) });
    },
    [mutate],
  );

  const url = photoId ? urls.data?.[photoId] : undefined;

  const onDelete = async () => {
    if (!photoId) return;
    const ok = await confirmAsync(
      "¿Eliminar la foto de la herramienta?",
      "Dejará de verse en la app. En el reporte de Excel se conserva como parte del historial.",
      { confirmText: "Eliminar", destructive: true },
    );
    if (ok) del.mutate(photoId);
  };

  return (
    <View style={styles.wrap}>
      {photoId ? (
        url ? (
          <Image source={{ uri: url }} style={styles.img} resizeMode="cover" accessibilityLabel="Foto de la herramienta" />
        ) : (
          <View style={[styles.img, styles.center]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )
      ) : (
        <View style={[styles.img, styles.center]}>
          <Ionicons name="image-outline" size={36} color={colors.textMuted} />
          <Text style={font.small}>Sin foto</Text>
        </View>
      )}

      {canEdit && !editing ? (
        <View style={styles.actions}>
          <Button
            title={photoId ? "Cambiar foto" : "Agregar foto"}
            icon="camera-outline"
            variant="secondary"
            compact
            onPress={() => setEditing(true)}
          />
          {photoId ? (
            <Button title="Eliminar foto" icon="trash-outline" variant="ghost" compact loading={del.isPending} onPress={onDelete} />
          ) : null}
        </View>
      ) : null}
      <ErrorBanner error={del.error} />
      {editing ? (
        <>
          <ErrorBanner error={setPhoto.error} />
          <PhotoPicker label="Nueva foto" max={1} onChange={onPhoto} />
          <Button title="Cancelar" variant="ghost" compact onPress={() => setEditing(false)} />
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    actions: { gap: space.xs },
    img: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.neutralSoft },
    center: { alignItems: "center", justifyContent: "center", gap: space.xs },
  }),
);
