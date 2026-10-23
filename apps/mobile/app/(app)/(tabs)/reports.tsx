import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { TOOL_STATUS_LABEL } from "@tt/shared";
import { HBarChart } from "@/components/charts/HBarChart";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { StatTile } from "@/components/charts/StatTile";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import {
  PERIOD_LABEL,
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
import { openReportDetail } from "@/features/reports/navigation";
import { exportInventoryExcel } from "@/features/reports/export";
import { useAuth } from "@/features/auth/AuthProvider";
import { notify } from "@/lib/dialogs";
import { formatDate, formatMoney } from "@/lib/format";
import { space, makeStyles, useTheme } from "@/theme";

export default function ReportsScreen() {
  const styles = useStyles();
  const { font, chart } = useTheme();
  const { can } = useAuth();
  // Los montos solo los ve quien tiene finance:read (el administrador); la API tampoco los envía al resto.
  const values = can("finance:read");
  const [preset, setPreset] = useState<Preset>("12m");
  const [showTable, setShowTable] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Memo: el rango incluye "ahora"; recalcularlo en cada render cambiaría la query key sin parar.
  const { range, granularity } = useMemo(() => presetRange(preset), [preset]);
  const spendSeries = [
    { name: "Compras", color: chart.series1 },
    { name: "Mantenimiento", color: chart.series2 },
  ];

  const summary = useReportSummary({}, values);
  const overTime = useSpendOverTime(range, granularity, values);
  const byCategory = useSpendByCategory(range, values);
  const losses = useLosses(range, values);

  const refreshing = summary.isRefetching || overTime.isRefetching || byCategory.isRefetching || losses.isRefetching;
  const refresh = () => {
    void summary.refetch();
    void overTime.refetch();
    void byCategory.refetch();
    void losses.refetch();
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportInventoryExcel();
    } catch (e) {
      await notify("No se pudo exportar", e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Button
        title="Exportar inventario a Excel"
        icon="download-outline"
        variant="secondary"
        loading={exporting}
        onPress={exportExcel}
      />
      <Text style={font.small}>
        Una pestaña por proyecto y bodega, con la foto más reciente de cada herramienta.
        {values ? "" : " Sin los montos: solo el administrador ve valores."}
      </Text>

      {!values ? (
        <Card>
          <Text style={font.h2}>Información financiera</Text>
          <Text style={font.small}>
            Los valores, compras, gastos y pérdidas solo los ve el administrador de la organización. Los conteos por estado están en
            el Panel de control.
          </Text>
        </Card>
      ) : (
        <>
      {/* Totales históricos (no dependen del periodo). Cada uno abre sus registros; ninguno se suma con otro. */}
      <ErrorBanner error={summary.error} />
      <View style={styles.tiles}>
        <StatTile
          label="Inventario vigente"
          value={formatMoney(summary.data?.inventoryValue)}
          caption="Valor de compra de lo que sigue en uso"
          onPress={() => openReportDetail("Inventario en uso", { metric: "inventory" })}
        />
        <StatTile
          label="Compras acumuladas"
          value={formatMoney(summary.data?.purchases.value)}
          caption={summary.data ? `${summary.data.purchases.count} herramientas propias` : undefined}
          onPress={() => openReportDetail("Compras (histórico)", { metric: "purchases" })}
        />
        <StatTile
          label="Dañadas hoy"
          value={formatMoney(summary.data?.damaged.value)}
          caption={summary.data ? `${summary.data.damaged.count} · valor de adquisición, no pérdida calculada` : undefined}
          onPress={() => openReportDetail("Herramientas dañadas", { metric: "tools", status: "DANADA" })}
        />
        <StatTile
          label="Extraviadas hoy"
          value={formatMoney(summary.data?.byStatus.EXTRAVIADA.value)}
          caption={summary.data ? `${summary.data.byStatus.EXTRAVIADA.count} · valor de adquisición` : undefined}
          onPress={() => openReportDetail("Herramientas extraviadas", { metric: "tools", status: "EXTRAVIADA" })}
        />
        <StatTile
          label="Dadas de baja"
          value={formatMoney(summary.data?.byStatus.DADA_DE_BAJA.value)}
          caption={summary.data ? `${summary.data.byStatus.DADA_DE_BAJA.count} · valor de adquisición` : undefined}
          onPress={() => openReportDetail("Herramientas dadas de baja", { metric: "tools", status: "DADA_DE_BAJA" })}
        />
        <StatTile
          label="Mantenimiento"
          value={formatMoney(summary.data?.maintenanceTotal)}
          caption="Costos registrados, incluye reparaciones"
          onPress={() => openReportDetail("Mantenimiento y reparaciones (histórico)", { metric: "maintenance" })}
        />
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
          <StackedBarChart
            series={spendSeries}
            columns={toSpendColumns(overTime.data ?? [], granularity)}
            onOpen={(col, si) => {
              const row = overTime.data?.[col];
              if (!row) return;
              const metric = si === 0 ? "purchases" : "maintenance";
              openReportDetail(`${si === 0 ? "Compras" : "Mantenimiento"} · ${PERIOD_LABEL(row.period, granularity)}`, {
                metric,
                period: row.period,
                granularity,
              });
            }}
          />
        )}
      </Card>

      {!showTable ? (
        <Card>
          <Text style={font.h2}>Pérdidas por periodo</Text>
          <Text style={font.small}>Valor de compra de lo dañado o extraviado, según la fecha del reporte</Text>
          {overTime.data ? (
            <StackedBarChart
              series={[{ name: "Pérdidas", color: chart.series1 }]}
              columns={toLossColumns(overTime.data, granularity)}
              height={120}
              onOpen={(col) => {
                const row = overTime.data?.[col];
                if (row) openReportDetail(`Pérdidas · ${PERIOD_LABEL(row.period, granularity)}`, { metric: "losses", period: row.period, granularity });
              }}
            />
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
            onPress={(categoryId) => {
              const c = byCategory.data?.find((x) => x.categoryId === categoryId);
              openReportDetail(`Compras de ${c?.category ?? "la categoría"} · ${PRESET_LABEL[preset]}`, { metric: "purchases", categoryId, ...range });
            }}
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
                <Pressable
                  key={s}
                  style={styles.lossTotal}
                  onPress={() => openReportDetail(`${TOOL_STATUS_LABEL[s]} · ${PRESET_LABEL[preset]}`, { metric: "losses", status: s, ...range })}
                >
                  <StatusBadge status={s} />
                  <Text style={styles.lossValue}>{formatMoney(losses.data.totals[s].value)}</Text>
                  <Text style={font.small}>{losses.data.totals[s].count} herramienta(s)</Text>
                </Pressable>
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
            {losses.data.rows.length > 0 ? (
              <Pressable onPress={() => openReportDetail(`Pérdidas · ${PRESET_LABEL[preset]}`, { metric: "losses", ...range })} hitSlop={8}>
                <Text style={styles.link}>Ver todas ({Object.values(losses.data.totals).reduce((n, t) => n + t.count, 0)}) ›</Text>
              </Pressable>
            ) : null}
          </>
        ) : losses.isLoading ? (
          <Loading />
        ) : null}
      </Card>
        </>
      )}
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
