import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, useTheme, type Colors } from "@/theme";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>["name"];
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const palette = (colors: Colors): Record<Variant, { bg: string; fg: string; border: string }> => ({
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
  ghost: { bg: "transparent", fg: colors.primaryDark, border: "transparent" },
});

export function Button({ title, onPress, variant = "primary", icon, loading, disabled, compact }: Props) {
  const { colors } = useTheme();
  const p = palette(colors)[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: p.bg, borderColor: p.border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={p.fg} /> : null}
          <Text style={[styles.text, { color: p.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  compact: { minHeight: 38, paddingHorizontal: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  text: { fontSize: 15, fontWeight: "700" },
});
