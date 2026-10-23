import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { makeStyles, radius, space, useTheme } from "@/theme";

interface Props {
  label: string;
  value: string;
  caption?: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  /** Medidor 0–1: relleno del color del indicador sobre una pista del mismo tono más claro. */
  meter?: { ratio: number; color: string; track: string };
  /** Abre el detalle de los registros que forman la cifra. */
  onPress?: () => void;
}

/** Indicador de la fila superior del tablero: etiqueta, cifra y un medidor opcional. */
export function KpiCard({ label, value, caption, icon, meter, onPress }: Props) {
  const styles = useStyles();
  const { font, colors } = useTheme();
  const ratio = meter ? Math.min(1, Math.max(0, meter.ratio)) : 0;
  const a11y = `${label}: ${value}${caption ? `, ${caption}` : ""}`;
  const body = (
    <>
      <View style={styles.head}>
        <Text style={[font.small, styles.label]} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <Ionicons name={icon} size={16} color={colors.textMuted} /> : null}
        {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} /> : null}
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {meter ? (
        <View style={[styles.track, { backgroundColor: meter.track }]}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: meter.color }]} />
        </View>
      ) : null}
      {caption ? <Text style={font.small}>{caption}</Text> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.card} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}. Ver detalle`}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      flexGrow: 1,
      flexBasis: 220,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    head: { flexDirection: "row", alignItems: "center", gap: space.xs },
    label: { flex: 1, fontWeight: "600" },
    value: { fontSize: 28, fontWeight: "800", color: colors.text },
    track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: space.xs },
    fill: { height: "100%", borderRadius: 3 },
    pressed: { opacity: 0.8 },
  }),
);
