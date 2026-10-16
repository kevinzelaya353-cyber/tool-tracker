import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { TOOL_STATUS_LABEL } from "@tt/shared";
import { HBarChart } from "@/components/charts/HBarChart";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { StatTile } from "@/components/charts/StatTile";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import {
  PRESET_LABEL,
  presetRange,
  toLossColumns,
  toSpendColumns,
  useLosses,
  useReportSummary,
  useSpendByCategory,
  useSpendOverTime,
  type Preset,
} from "@/features/reports/api";
import { formatDate, formatMoney } from "@/lib/format";
import { space, makeStyles, useTheme } from "@/theme";

export default function ReportsScreen() {
  const styles = useStyles();
  const { font, chart } = useTheme();
  const [preset, setPreset] = useState<Preset>("12m");
  const [showTable, setShowTable] = useState(false);
  // Memo: el rango incluye "ahora"; recalcularlo en cada render cambiaría la query key sin parar.
  const { range, granularity } = useMemo(() => presetRange(preset), [preset]);
  const spendSeries = [
    { name: "Compras", color: chart.series1 },
    { name: "Mantenimiento", color: chart.series2 },
  ];

  const summary = useReportSummary();
  const overTime = useSpendOverTime(range, granularity);
  const byCategory = useSpendByCategory(range);
  const losses = useLosses(range);

  const refreshing = summary.isRefetching || overTime.isRefetching || byCategory.isRefetching || losses.isRefetching;
  const refresh = () => {
    void summary.refetch();
    void overTime.refetch();
    void byCategory.refetch();
    void losses.refetch();
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {/* Totales históricos (no dependen del periodo) */}
      <ErrorBanner error={summary.error} />
      <View style={styles.tiles}>
        <StatTile label="Inventario vigente" value={formatMoney(summary.data?.inventoryValue)} caption="Valor de compra en uso" />
        <StatTile label="Pérdidas" value={formatMoney(summary.data?.lossValue)} caption="Dañadas, extraviadas y bajas" />
        <StatTile label="Compras acumuladas" value={formatMoney(summary.data?.purchaseTotal)} />
        <StatTile label="Mantenimiento" value={formatMoney(summary.data?.maintenanceTotal)} caption="Incluye reparaciones" />
      </View>

      {/* Filtro de periodo: una sola fila sobre las gráficas */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
          <Chip key={p} label={PRESET_LABEL[p]} selected={preset === p} onPress={() => setPreset(p)} />
        ))}
      </ScrollView>

      <Card>
        <View style={styles.cardHeader}>
          <Text style={font.h2}>Gasto {granularity === "year" ? "anual" : "mensual"}</Text>
          <Pressable onPress={() => setShowTable((v) => !v)} hitSlop={8}>
            <Text style={styles.link}>{showTable ? "Ver gráfica" : "Ver tabla"}</Text>
          </Pressable>
        </View>
        <ErrorBanner error={overTime.error} />
        {overTime.isLoading ? (
          <Loading />
        ) : showTable ? (
          <View>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.td, styles.tdFirst]}>Periodo</Text>
              <Text style={styles.td}>Compras</Text>
              <Text style={styles.td}>Mant.</Text>
              <Text style={styles.td}>Pérdidas</Text>
            </View>
            {toSpendColumns(overTime.data ?? [], granularity).map((c, i) => (
              <View key={c.fullLabel} style={styles.tr}>
                <Text style={[styles.td, styles.tdFirst]}>{c.fullLabel}</Text>
                <Text style={styles.td}>{formatMoney(c.values[0])}</Text>
                <Text style={styles.td}>{formatMoney(c.values[1])}</Text>
                <Text style={styles.td}>{formatMoney(overTime.data?.[i]?.losses)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <StackedBarChart series={spendSeries} columns={toSpendColumns(overTime.data ?? [], granularity)} />
        )}
      </Card>

      {!showTable ? (
        <Card>
          <Text style={font.h2}>Pérdidas por periodo</Text>
          <Text style={font.small}>Valor de compra de lo dañado o extraviado, según la fecha del reporte</Text>
          {overTime.data ? (
            <StackedBarChart series={[{ name: "Pérdidas", color: chart.series1 }]} columns={toLossColumns(overTime.data, granularity)} height={120} />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text style={font.h2}>Compras por tipo de herramienta</Text>
        <ErrorBanner error={byCategory.error} />
        {byCategory.isLoading ? (
          <Loading />
        ) : (
          <HBarChart
            rows={(byCategory.data ?? []).map((c) => ({
              key: c.categoryId,
              label: c.category,
              value: Number(c.purchaseTotal),
              caption: [
                `${c.purchasedCount} comprada(s)`,
                Number(c.maintenanceTotal) > 0 ? `mant. ${formatMoney(c.maintenanceTotal)}` : null,
                c.lossCount > 0 ? `${c.lossCount} perdida(s) · ${formatMoney(c.lossTotal)}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        )}
      </Card>

      <Card>
        <Text style={font.h2}>Control de pérdidas</Text>
        <ErrorBanner error={losses.error} />
        {losses.data ? (
          <>
            <View style={styles.lossTotals}>
              {(["DANADA", "EXTRAVIADA", "DADA_DE_BAJA"] as const).map((s) => (
                <View key={s} style={styles.lossTotal}>
                  <StatusBadge status={s} />
                  <Text style={styles.lossValue}>{formatMoney(losses.data.totals[s].value)}</Text>
                  <Text style={font.small}>{losses.data.totals[s].count} herramienta(s)</Text>
                </View>
              ))}
            </View>
            <Text style={[font.body, styles.bold]}>Total en el periodo: {formatMoney(losses.data.totalValue)}</Text>
            {losses.data.rows.slice(0, 10).map((r) => (
              <Pressable key={r.toolId} style={styles.lossRow} onPress={() => router.push(`/tool/${r.toolId}`)}>
                <View style={styles.flex}>
                  <Text style={styles.code}>{r.code}</Text>
                  <Text style={font.small} numberOfLines={1}>
                    {r.category} {r.brand} · {TOOL_STATUS_LABEL[r.status]}
                    {r.location ? ` · ${r.location}` : ""}
                    {r.lossAt ? ` · ${formatDate(r.lossAt)}` : ""}
                  </Text>
                </View>
                <Text style={styles.amount}>{formatMoney(r.purchasePrice)}</Text>
              </Pressable>
            ))}
            {losses.data.rows.length === 0 ? <Text style={font.small}>Sin pérdidas en el periodo.</Text> : null}
          </>
        ) : losses.isLoading ? (
          <Loading />
        ) : null}
      </Card>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors, chart }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, gap: space.lg },
    flex: { flex: 1 },
    bold: { fontWeight: "700" },
    tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
    chips: { gap: space.sm },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    link: { color: colors.primaryDark, fontWeight: "700" },
    tr: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    th: { borderBottomColor: chart.axis },
    td: { flex: 1, fontSize: 12, color: colors.text, textAlign: "right", fontVariant: ["tabular-nums"] },
    tdFirst: { flex: 1.3, textAlign: "left", textTransform: "capitalize" },
    lossTotals: { flexDirection: "row", gap: space.sm },
    lossTotal: { flex: 1, gap: 4 },
    lossValue: { fontSize: 16, fontWeight: "800", color: colors.text },
    lossRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      paddingVertical: space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
    amount: { fontSize: 14, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  }),
);
