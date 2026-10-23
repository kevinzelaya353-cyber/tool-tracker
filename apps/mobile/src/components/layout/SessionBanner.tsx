import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { space } from "@/theme";

/**
 * Franja fija sobre toda la app:
 * - en una sesión de soporte (impersonación), siempre visible y con el botón para terminarla;
 * - si el SuperAdmin está operando dentro de una organización, cuál es y cómo volver a la plataforma.
 * Colores fijos (no del tema): debe destacar igual en claro y en oscuro.
 */
export function SessionBanner() {
  const { user, supportActor, org, isSuperadmin, endImpersonation, selectOrg } = useAuth();
  const insets = useSafeAreaInsets();
  const [ending, setEnding] = useState(false);

  if (supportActor && user) {
    const end = async () => {
      setEnding(true);
      try {
        await endImpersonation();
        router.navigate("/");
      } finally {
        setEnding(false);
      }
    };
    return (
      <View style={[styles.bar, styles.support, { paddingTop: insets.top + space.xs }]} accessibilityRole="alert">
        <Ionicons name="shield-half-outline" size={18} color="#1F1300" />
        <Text style={[styles.text, styles.supportText]} numberOfLines={2}>
          Sesión de soporte — Accediendo como {user.name}
          {user.organization ? ` (${user.organization.name})` : ""}
        </Text>
        <Pressable onPress={end} style={[styles.button, styles.supportButton]} accessibilityRole="button" disabled={ending}>
          {ending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.buttonText}>Finalizar impersonación</Text>}
        </Pressable>
      </View>
    );
  }

  if (isSuperadmin && org) {
    return (
      <View style={[styles.bar, styles.org, { paddingTop: insets.top + space.xs }]}>
        <Ionicons name="business-outline" size={18} color="#FFFFFF" />
        <Text style={[styles.text, styles.orgText]} numberOfLines={1}>
          Operando en {org.name}
        </Text>
        <Pressable
          onPress={() => {
            selectOrg(null);
            router.navigate("/");
          }}
          style={[styles.button, styles.orgButton]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Volver a la plataforma</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.xs },
  support: { backgroundColor: "#F59E0B" },
  org: { backgroundColor: "#1E293B" },
  text: { flex: 1, fontSize: 13, fontWeight: "800" },
  supportText: { color: "#1F1300" },
  orgText: { color: "#FFFFFF" },
  button: { borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 6 },
  supportButton: { backgroundColor: "#1F1300" },
  orgButton: { backgroundColor: "#334155" },
  buttonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
