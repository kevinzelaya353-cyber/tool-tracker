import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/lib/api";
import { radius, space, makeStyles, useTheme } from "@/theme";

/** Muestra el mensaje de un error de API y, si existen, el detalle por herramienta/campo. */
export function ErrorBanner({ error }: { error: unknown }) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Error inesperado";
  const details = error instanceof ApiError ? error.detailMessages : [];
  return (
    <View style={styles.error} accessibilityRole="alert">
      <View style={styles.row}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <Text style={[font.body, styles.errorTitle]}>{message}</Text>
      </View>
      {details.map((d, i) => (
        <Text key={i} style={styles.errorDetail}>
          • {d}
        </Text>
      ))}
    </View>
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  children,
}: {
  icon?: ComponentProps<typeof Ionicons>["name"];
  title: string;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Text style={font.h2}>{title}</Text>
      {children}
    </View>
  );
}

export function Loading() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    error: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md, gap: space.xs },
    row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
    errorTitle: { flex: 1, color: colors.danger, fontWeight: "600" },
    errorDetail: { fontSize: 13, color: colors.danger, marginLeft: space.xl },
    empty: { alignItems: "center", gap: space.sm, padding: space.xxl },
    loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl },
  }),
);
