import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney } from "@/lib/format";
import { radius, space, makeStyles, useTheme } from "@/theme";
import { compact, niceScale } from "./scale";

export interface Series {
  name: string;
  color: string;
}

export interface Column {
  label: string; // etiqueta corta del eje (p. ej. "ene")
  fullLabel: string; // para el tooltip (p. ej. "enero 2026")
  values: number[]; // un valor por serie, mismo orden que `series`
}

interface Props {
  series: Series[];
  columns: Column[];
  height?: number;
  /** Abre el detalle de una serie en la barra elegida (aparece un enlace por serie en el recuadro). */
  onOpen?: (columnIndex: number, seriesIndex: number) => void;
}

const GAP = 2; // separación de superficie entre segmentos apilados
const AXIS_W = 40;

/**
 * Barras verticales apiladas (una serie = barras simples). Tocar una columna muestra
 * el detalle arriba del gráfico: es el equivalente táctil del hover.
 */
export function StackedBarChart({ series, columns, height = 170, onOpen }: Props) {
  const styles = useStyles();
  const { font } = useTheme();
  const [active, setActive] = useState<number | null>(null);
  const totals = useMemo(() => columns.map((c) => c.values.reduce((s, v) => s + v, 0)), [columns]);
  const { top, steps } = useMemo(() => niceScale(Math.max(0, ...totals)), [totals]);
  const sel = active !== null ? columns[active] : null;
  const showEvery = columns.length > 12 ? Math.ceil(columns.length / 6) : columns.length > 6 ? 2 : 1;

  return (
    <View style={styles.wrap}>
      {/* Leyenda solo con ≥ 2 series; con una, el título de la sección la nombra. */}
      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.tooltip} accessibilityLiveRegion="polite">
        {sel ? (
          <>
            <Text style={styles.tooltipTitle}>{sel.fullLabel}</Text>
            <View style={styles.tooltipRow}>
              {series.map((s, i) => (
                <View key={s.name} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: s.color }]} />
                  <Text style={styles.tooltipText}>
                    {series.length > 1 ? `${s.name}: ` : ""}
                    {formatMoney(sel.values[i] ?? 0)}
                  </Text>
                </View>
              ))}
              {series.length > 1 ? <Text style={styles.tooltipTotal}>Total {formatMoney(totals[active!] ?? 0)}</Text> : null}
            </View>
            {onOpen ? (
              <View style={styles.tooltipRow}>
                {series.map((s, i) =>
                  (sel.values[i] ?? 0) > 0 ? (
                    <Pressable
                      key={s.name}
                      onPress={() => onOpen(active!, i)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver ${s.name.toLowerCase()} de ${sel.fullLabel}`}
                    >
                      <Text style={styles.open}>Ver {s.name.toLowerCase()} ›</Text>
                    </Pressable>
                  ) : null,
                )}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={font.small}>{onOpen ? "Toca una barra para ver sus cifras y abrir sus registros" : "Toca una barra para ver el detalle"}</Text>
        )}
      </View>

      <View style={[styles.plot, { height }]}>
        {/* Eje Y y rejilla recesiva */}
        {steps.map((v) => (
          <View key={v} style={[styles.gridLine, { bottom: (v / top) * height }]}>
            <Text style={styles.axisLabel}>{compact(v)}</Text>
          </View>
        ))}

        <View style={styles.columns}>
          {columns.map((c, ci) => (
            <Pressable
              key={`${c.label}-${ci}`}
              style={styles.hit} // zona táctil = columna completa, más grande que la barra
              onPress={() => setActive(active === ci ? null : ci)}
              accessibilityRole="button"
              accessibilityLabel={`${c.fullLabel}: ${series.map((s, i) => `${s.name} ${formatMoney(c.values[i] ?? 0)}`).join(", ")}`}
            >
              <View style={[styles.stack, active !== null && active !== ci && styles.dimmed]}>
                {c.values.map((v, si) => {
                  if (v <= 0) return null;
                  const isTop = c.values.slice(si + 1).every((x) => x <= 0);
                  return (
                    <View
                      key={si}
                      style={{
                        height: Math.max(2, (v / top) * height - GAP),
                        marginTop: GAP,
                        backgroundColor: series[si]?.color,
                        borderTopLeftRadius: isTop ? 4 : 0,
                        borderTopRightRadius: isTop ? 4 : 0,
                      }}
                    />
                  );
                })}
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.xAxis}>
        {columns.map((c, i) => (
          <Text key={`${c.label}-${i}`} style={styles.xLabel} numberOfLines={1}>
            {i % showEvery === 0 ? c.label : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, chart }) =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    legend: { flexDirection: "row", gap: space.lg, flexWrap: "wrap" },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    swatch: { width: 10, height: 10, borderRadius: 2 },
    legendText: { fontSize: 13, color: chart.inkSecondary, fontWeight: "600" },
    tooltip: { minHeight: 44, justifyContent: "center", backgroundColor: colors.neutralSoft, borderRadius: radius.sm, padding: space.sm },
    tooltipTitle: { fontSize: 13, fontWeight: "700", color: colors.text, textTransform: "capitalize" },
    tooltipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: 2 },
    tooltipText: { fontSize: 13, color: colors.text },
    tooltipTotal: { fontSize: 13, color: colors.text, fontWeight: "700" },
    open: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
    plot: { marginLeft: AXIS_W, position: "relative" },
    gridLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: chart.grid,
    },
    axisLabel: { position: "absolute", left: -AXIS_W, width: AXIS_W - 6, top: -8, textAlign: "right", fontSize: 11, color: chart.muted },
    columns: { ...StyleSheet.absoluteFill, flexDirection: "row", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: chart.axis },
    hit: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" },
    stack: { width: "62%", maxWidth: 28, flexDirection: "column-reverse" },
    dimmed: { opacity: 0.35 },
    xAxis: { marginLeft: AXIS_W, flexDirection: "row" },
    xLabel: { flex: 1, textAlign: "center", fontSize: 11, color: chart.muted },
  }),
);
