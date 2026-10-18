import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { makeStyles, space, useTheme } from "@/theme";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  /** Cifra del centro cuando no hay segmento seleccionado (p. ej. el total). */
  centerValue: string;
  centerLabel: string;
  size?: number;
  /** Al tocar una fila de la leyenda (además de resaltarla). */
  onSelect?: (key: string) => void;
}

const STROKE = 14;
const GAP_PX = 2; // separación de superficie entre segmentos

/**
 * Anillo de parte-del-todo (≤ 6 segmentos). La leyenda siempre está, con el valor y el % en
 * texto: el color nunca es el único canal. Tocar una fila resalta su segmento y lo muestra al centro.
 */
export function DonutChart({ segments, centerValue, centerLabel, size = 150, onSelect }: Props) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const [active, setActive] = useState<string | null>(null);
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  const r = (size - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const sel = shown.find((s) => s.key === active);
  const pct = (v: number) => (total ? (v / total) * 100 : 0);

  let offset = 0;
  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }} accessible accessibilityLabel={`${centerLabel}: ${centerValue}`}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Pista: el anillo vacío cuando no hay datos. */}
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.neutralSoft} strokeWidth={STROKE} fill="none" />
          {shown.map((s) => {
            const len = (s.value / total) * circ;
            // Un solo segmento ocupa todo el anillo, sin hueco.
            const dash = shown.length > 1 ? Math.max(0.5, len - GAP_PX) : len;
            const el = (
              <Circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={s.color}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
                opacity={active && active !== s.key ? 0.3 : 1}
                // Empieza arriba (12 en punto) y avanza en sentido horario.
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
            {sel ? `${Math.round(pct(sel.value))}%` : centerValue}
          </Text>
          <Text style={[font.small, styles.centerLabel]} numberOfLines={2}>
            {sel ? sel.label : centerLabel}
          </Text>
        </View>
      </View>

      <View style={styles.legend}>
        {shown.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.row, active === s.key && { backgroundColor: colors.neutralSoft }]}
            onPress={() => {
              setActive(active === s.key ? null : s.key);
              onSelect?.(s.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${s.value}, ${pct(s.value).toFixed(1)}%`}
          >
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={[font.small, styles.label]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={styles.count}>{s.value}</Text>
            <Text style={styles.pct}>{pct(s.value).toFixed(1)}%</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, chart }) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space.md },
    center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: STROKE + 6 },
    centerValue: { fontSize: 24, fontWeight: "800", color: colors.text },
    centerLabel: { textAlign: "center" },
    legend: { alignSelf: "stretch", gap: 2 },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 3, paddingHorizontal: space.xs, borderRadius: 6 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    label: { flex: 1, color: chart.inkSecondary },
    // Columnas de números alineadas.
    count: { width: 36, textAlign: "right", fontSize: 12, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
    pct: { width: 52, textAlign: "right", fontSize: 12, color: chart.muted, fontVariant: ["tabular-nums"] },
  }),
);
