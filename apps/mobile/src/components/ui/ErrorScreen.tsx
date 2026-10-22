import { Ionicons } from "@expo/vector-icons";
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { recordCrash } from "@/lib/crashLog";
import { space, useTheme } from "@/theme";
import { Button } from "./Button";

/**
 * Lo que se ve si una pantalla falla al dibujarse: en vez de cerrar la app, se explica qué pasó y
 * se puede reintentar o volver. Los datos ya guardados no se pierden (están en el servidor).
 */
export function ErrorScreen({ error, retry, onHome }: ErrorBoundaryProps & { onHome?: () => void }) {
  const { colors, font } = useTheme();
  useEffect(() => {
    recordCrash(error, { fatal: false, where: "ErrorBoundary" });
  }, [error]);
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Ionicons name="warning-outline" size={40} color={colors.warning} />
      <Text style={font.h2}>Algo salió mal en esta pantalla</Text>
      <Text style={[font.body, styles.center]}>
        La app no se cerró. Lo que ya se guardó está a salvo. Puedes reintentar o volver al inicio.
      </Text>
      <Text style={[font.small, styles.center]} selectable>
        {error.message}
      </Text>
      <View style={styles.buttons}>
        <Button title="Reintentar" icon="refresh" onPress={() => void retry()} />
        {onHome ? <Button title="Ir al inicio" icon="home-outline" variant="secondary" onPress={onHome} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md },
  center: { textAlign: "center" },
  buttons: { alignSelf: "stretch", gap: space.sm },
});
