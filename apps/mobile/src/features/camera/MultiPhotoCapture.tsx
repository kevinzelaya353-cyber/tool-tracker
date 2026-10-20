import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { ModalSafeArea } from "@/components/ui/ModalSafeArea";
import { radius, space, makeStyles, useTheme } from "@/theme";
import type { LocalImage } from "../media/api";
import { compressImage } from "./compress";

interface Props {
  visible: boolean;
  /** Cuántas fotos más se pueden agregar. */
  remaining: number;
  onClose(): void;
  onDone(images: LocalImage[]): void;
}

/**
 * Cámara a pantalla completa para tomar varias fotos seguidas sin salir.
 * Las fotos se comprimen al capturarlas; el usuario puede descartar antes de confirmar.
 */
export function MultiPhotoCapture({ visible, remaining, onClose, onDone }: Props) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [shots, setShots] = useState<LocalImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0); // fotos aún comprimiéndose
  const [facing, setFacing] = useState<"back" | "front">("back");
  const left = remaining - shots.length;

  const reset = () => {
    setShots([]);
    setBusy(false);
  };

  const take = async () => {
    if (!camera.current || busy || left <= 0) return;
    setBusy(true);
    let pic: LocalImage | undefined;
    try {
      pic = await camera.current.takePictureAsync({ quality: 0.9 });
    } finally {
      setBusy(false); // el obturador queda libre mientras se comprime
    }
    if (!pic) return;
    const original = pic;
    setShots((s) => [...s, original]);
    setPending((n) => n + 1);
    try {
      const small = await compressImage(original);
      setShots((s) => s.map((x) => (x.uri === original.uri ? small : x)));
    } finally {
      setPending((n) => n - 1);
    }
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: left,
      quality: 1,
    });
    if (res.canceled) return;
    setBusy(true);
    try {
      const compressed = await Promise.all(res.assets.slice(0, left).map((a) => compressImage(a)));
      setShots((s) => [...s, ...compressed]);
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    onDone(shots);
    reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <ModalSafeArea style={styles.root} statusBar="light">
        {!permission ? (
          <ActivityIndicator style={styles.flex} color="#fff" />
        ) : !permission.granted ? (
          <View style={styles.permission}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text style={[font.h2, styles.white]}>Se necesita acceso a la cámara</Text>
            <Text style={[font.body, styles.mutedWhite]}>
              Para registrar el estado físico de las herramientas en cada movimiento.
            </Text>
            <Button title="Permitir cámara" icon="camera" onPress={requestPermission} />
            <Button title="Elegir de la galería" variant="secondary" icon="images-outline" onPress={pickFromGallery} />
            <Button title="Cancelar" variant="ghost" onPress={close} />
          </View>
        ) : (
          <>
            <View style={styles.topBar}>
              <Pressable onPress={close} hitSlop={12} accessibilityLabel="Cerrar cámara">
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              <Text style={styles.counter}>
                {shots.length} foto{shots.length === 1 ? "" : "s"} · quedan {left}
              </Text>
              <Pressable onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))} hitSlop={12} accessibilityLabel="Cambiar cámara">
                <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
              </Pressable>
            </View>

            <CameraView ref={camera} style={styles.flex} facing={facing} />

            <FlatList
              horizontal
              data={shots}
              keyExtractor={(s) => s.uri}
              contentContainerStyle={styles.strip}
              renderItem={({ item }) => (
                <View>
                  <Image source={{ uri: item.uri }} style={styles.thumb} />
                  <Pressable
                    style={styles.remove}
                    onPress={() => setShots((s) => s.filter((x) => x.uri !== item.uri))}
                    accessibilityLabel="Quitar foto"
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              )}
            />

            <View style={styles.controls}>
              <Pressable onPress={pickFromGallery} disabled={left <= 0} style={styles.side} accessibilityLabel="Galería">
                <Ionicons name="images-outline" size={28} color={left > 0 ? "#fff" : "#666"} />
              </Pressable>
              <Pressable
                onPress={take}
                disabled={busy || left <= 0}
                style={[styles.shutter, (busy || left <= 0) && styles.shutterDisabled]}
                accessibilityLabel="Tomar foto"
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <Pressable onPress={finish} disabled={shots.length === 0 || busy || pending > 0} style={styles.side} accessibilityLabel="Listo">
                {pending > 0 ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.done, (shots.length === 0 || busy) && styles.doneDisabled]}>Listo</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </ModalSafeArea>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    flex: { flex: 1 },
    white: { color: "#fff", textAlign: "center" },
    mutedWhite: { color: "#CBD5E1", textAlign: "center" },
    permission: { flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg, alignItems: "stretch" },
    topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.lg },
    counter: { color: "#fff", fontWeight: "700" },
    strip: { gap: space.sm, padding: space.sm, minHeight: 80 },
    thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: "#222" },
    remove: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xl, paddingVertical: space.lg },
    side: { width: 64, alignItems: "center" },
    shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
    shutterDisabled: { opacity: 0.4 },
    shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
    done: { color: colors.primary, fontSize: 17, fontWeight: "800" },
    doneDisabled: { color: "#666" },
  }),
);
