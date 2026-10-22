import { StyleSheet, Text, View } from "react-native";
import { TOOL_STATUS_LABEL, type ToolStatus } from "@tt/shared";
import { radius, space, useTheme } from "@/theme";

export function StatusBadge({ status }: { status: ToolStatus }) {
  const { statusColors } = useTheme();
  // Un estado que esta versión de la app no conoce (API más nueva) se muestra neutro, sin romper la pantalla.
  const c = statusColors[status] ?? statusColors.DADA_DE_BAJA;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <Text style={[styles.text, { color: c.fg }]}>{(TOOL_STATUS_LABEL[status] ?? status).replace(" (disponible)", "")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: "700" },
});
