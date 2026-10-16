import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { radius, space, makeStyles, useTheme } from "@/theme";

interface Props {
  title?: string;
  onScanned(code: string): void;
  onClose(): void;
}

/** Lector de QR/códigos de barras. Ignora lecturas repetidas durante 2 s. */
export function QrScanner({ title = "Escanea el código de la herramienta", onScanned, onClose }: Props) {
  const styles = useStyles();
  const { font } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef<{ code: string; at: number } | null>(null);

  const handle = ({ data }: { data: string }) => {
    const code = data.trim().toUpperCase();
    const now = Date.now();
    if (last.current && last.current.code === code && now - last.current.at < 2000) return;
    last.current = { code, at: now };
    onScanned(code);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.top}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 28 }} />
      </View>

      {!permission ? (
        <ActivityIndicator style={styles.flex} color="#fff" />
      ) : !permission.granted ? (
        <View style={styles.permission}>
          <Text style={[font.body, styles.white]}>Se necesita la cámara para escanear códigos.</Text>
          <Button title="Permitir cámara" icon="camera" onPress={requestPermission} />
        </View>
      ) : (
        <View style={styles.flex}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39"] }}
            onBarcodeScanned={handle}
          />
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    flex: { flex: 1 },
    white: { color: "#fff", textAlign: "center" },
    top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg },
    title: { color: "#fff", fontWeight: "700", flex: 1, textAlign: "center" },
    permission: { flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg },
    frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
    frame: { width: 240, height: 240, borderWidth: 3, borderColor: colors.primary, borderRadius: radius.lg },
  }),
);
