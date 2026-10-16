import { StyleSheet, Text, View } from "react-native";
import { TOOL_STATUS_LABEL, type ToolStatus } from "@tt/shared";
import { radius, space, useTheme } from "@/theme";

export function StatusBadge({ status }: { status: ToolStatus }) {
  const { statusColors } = useTheme();
  const c = statusColors[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <Text style={[styles.text, { color: c.fg }]}>{TOOL_STATUS_LABEL[status].replace(" (disponible)", "")}</Text>
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
