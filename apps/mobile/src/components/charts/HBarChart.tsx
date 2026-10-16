import { StyleSheet, Text, View } from "react-native";
import { formatMoney } from "@/lib/format";
import { space, makeStyles, useTheme } from "@/theme";

export interface HBarRow {
  key: string;
  label: string;
  value: number;
  caption?: string;
}

interface Props {
  rows: HBarRow[];
  color?: string;
  /** Filas máximas; el resto se agrupa en "Otros" (nunca se generan colores extra). */
  max?: number;
}

/** Barras horizontales ordenadas de mayor a menor, con la etiqueta y el monto en texto (no en el color). */
export function HBarChart({ rows, color, max = 8 }: Props) {
  const styles = useStyles();
  const { chart } = useTheme();
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  if (rest.length) {
    shown.push({ key: "__other", label: `Otros (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0) });
  }
  const top = Math.max(1, ...shown.map((r) => r.value));

  if (shown.length === 0) return <Text style={styles.empty}>Sin datos en el periodo</Text>;

  return (
    <View style={styles.wrap}>
      {shown.map((r) => (
        <View key={r.key} style={styles.row} accessible accessibilityLabel={`${r.label}: ${formatMoney(r.value)}`}>
          <View style={styles.labels}>
            <Text style={styles.label} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={styles.value}>{formatMoney(r.value)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${(r.value / top) * 100}%`, backgroundColor: color ?? chart.series1 }]} />
          </View>
          {r.caption ? <Text style={styles.caption}>{r.caption}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors, chart }) =>
  StyleSheet.create({
    wrap: { gap: space.md },
    row: { gap: 4 },
    labels: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
    label: { flex: 1, fontSize: 14, color: colors.text, fontWeight: "600" },
    value: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
    track: { height: 10, borderRadius: 4, backgroundColor: colors.neutralSoft, overflow: "hidden" },
    bar: { height: "100%", borderTopRightRadius: 4, borderBottomRightRadius: 4, minWidth: 2 },
    caption: { fontSize: 12, color: chart.muted },
    empty: { fontSize: 13, color: chart.muted, textAlign: "center", padding: space.lg },
  }),
);
