import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { TOOL_STATUS_LABEL, type ToolStatus } from "@tt/shared";
import { DonutChart, type DonutSegment } from "@/components/charts/DonutChart";
import { HBarChart } from "@/components/charts/HBarChart";
import { KpiCard } from "@/components/charts/KpiCard";
import { StackedBarChart, type Series } from "@/components/charts/StackedBarChart";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner } from "@/components/ui/Feedback";
import { SelectField } from "@/components/ui/SelectField";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCategories, useLocations } from "@/features/catalog/api";
import { PlatformDashboard } from "@/features/platform/PlatformDashboard";
import {
  PRESET_LABEL,
  presetRange,
  toSpendColumns,
  useReportSummary,
  useSpendByCategory,
  useSpendOverTime,
  type DetailParams,
  type Preset,
  type ReportFilters,
} from "@/features/reports/api";
import { openReportDetail } from "@/features/reports/navigation";
import { usePendingTransfers, type PendingFilter } from "@/features/transfers/api";
import { formatMoney } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/theme";

/** Estados del tablero (las dadas de baja ya no son inventario). ≤ 6: caben en un anillo. */
const STATUS_ORDER: ToolStatus[] = ["BODEGA", "EN_PROYECTO", "EN_TRANSITO", "EN_MANTENIMIENTO", "DANADA", "EXTRAVIADA"];
const PRESETS: Preset[] = ["12m", "ytd", "5y"];
const DEFAULT_PRESET: Preset = "12m";
/** Más de esto en camino se marca como atrasado. */
const LATE_HOURS = 24;
/** Ancho del contenido desde el que el tablero se arma en columnas. */
const WIDE = 760;
const ALL = "__all__";

type Trend = "all" | "purchases" | "maintenance";
const TREND_LABEL: Record<Trend, string> = { all: "Todo", purchases: "Compras", maintenance: "Mantenimiento" };

const pct = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
const pctText = (r: number) => `${(r * 100).toFixed(1)}%`;
const statusLabel = (s: ToolStatus) => TOOL_STATUS_LABEL[s].replace(" (disponible)", "");

/** El SuperAdmin sin organización elegida ve el tablero de la plataforma; el resto, el de su organización. */
export default function Home() {
  const { isSuperadmin, org } = useAuth();
  return isSuperadmin && !org ? <PlatformDashboard /> : <Dashboard />;
}

function Dashboard() {
  const styles = useStyles();
  const { colors, font, chart, statusColors } = useTheme();
  const { user, can, org } = useAuth();
  const { width } = useWindowDimensions();
  // El panel lateral (≥ 900) ocupa 232 px.
  const contentWidth = width >= 900 ? width - 232 : width;
  const wide = contentWidth >= WIDE;

  const canReports = can("reports:read");
  const values = can("finance:read");
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [trend, setTrend] = useState<Trend>("all");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [locationId, setLocationId] = useState<string | undefined>();
  const period = useMemo(() => presetRange(preset), [preset]);
  // Los mismos filtros para los totales y para el detalle que abre cada cifra.
  const filters: ReportFilters = useMemo(() => ({ ...period.range, categoryId, locationId }), [period, categoryId, locationId]);

  const summary = useReportSummary(filters, canReports);
  const spend = useSpendOverTime(filters, period.granularity, canReports && values);
  const byCategory = useSpendByCategory(filters, canReports && values);
  const categories = useCategories();
  const locations = useLocations();

  const s = summary.data;
  const counts = useMemo(
    () => (s ? (Object.fromEntries(STATUS_ORDER.map((k) => [k, s.byStatus[k].count])) as Record<ToolStatus, number>) : undefined),
    [s],
  );
  const total = counts ? STATUS_ORDER.reduce((sum, k) => sum + counts[k], 0) : 0;
  const inventory = Number(s?.inventoryValue ?? 0);
  const purchaseTotal = Number(s?.purchaseTotal ?? 0);

  /** Detalle con los filtros del tablero aplicados. `range: false` = estado actual (sin periodo). */
  const open = (title: string, params: Omit<DetailParams, "from" | "to"> & { range?: boolean }) => {
    const { range = false, ...rest } = params;
    openReportDetail(title, { categoryId, locationId, ...(range ? period.range : {}), ...rest });
  };

  const statusSegments: DonutSegment[] = STATUS_ORDER.map((k) => ({
    key: k,
    label: statusLabel(k),
    value: counts?.[k] ?? 0,
    color: statusColors[k].fg,
  }));

  // Proyectos con más herramientas: 4 colores fijos y el resto en "Otros" (gris), nunca un color extra.
  const projects = useMemo(() => (s?.byLocation ?? []).filter((l) => l.type === "PROYECTO"), [s]);
  const projectTools = projects.reduce((sum, p) => sum + p.count, 0);
  const slots = [chart.series1, chart.series2, chart.series3, chart.series4];
  const projectSegments: DonutSegment[] = projects.slice(0, 4).map((p, i) => ({
    key: p.locationId,
    label: p.name,
    value: p.count,
    color: slots[i]!,
  }));
  const rest = projects.slice(4).reduce((sum, p) => sum + p.count, 0);
  if (rest > 0) projectSegments.push({ key: "__other", label: `Otros (${projects.length - 4})`, value: rest, color: chart.other });

  const trendSeries: Record<Trend, Series[]> = {
    all: [
      { name: "Compras", color: chart.series1 },
      { name: "Mantenimiento", color: chart.series2 },
    ],
    purchases: [{ name: "Compras", color: chart.series1 }],
    maintenance: [{ name: "Mantenimiento", color: chart.series2 }],
  };
  const trendMetrics: Record<Trend, ("purchases" | "maintenance")[]> = {
    all: ["purchases", "maintenance"],
    purchases: ["purchases"],
    maintenance: ["maintenance"],
  };
  const trendColumns = useMemo(() => {
    const cols = toSpendColumns(spend.data ?? [], period.granularity);
    if (trend === "all") return cols;
    const i = trend === "purchases" ? 0 : 1;
    return cols.map((c) => ({ ...c, values: [c.values[i] ?? 0] }));
  }, [spend.data, period.granularity, trend]);

  const refreshing = summary.isRefetching || spend.isRefetching || byCategory.isRefetching;
  const refresh = () => {
    void summary.refetch();
    void spend.refetch();
    void byCategory.refetch();
  };
  const resetFilters = () => {
    setPreset(DEFAULT_PRESET);
    setTrend("all");
    setCategoryId(undefined);
    setLocationId(undefined);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {/* Encabezado: título y filtros en una sola fila sobre las gráficas. */}
      <View style={[styles.header, wide && styles.headerWide]}>
        <View style={styles.flex}>
          <Text style={styles.title}>Panel de control</Text>
          <Text style={font.small}>
            <Text style={styles.subtitleStrong}>Hola, {user?.name}.</Text>{" "}
            {org ? `Operando en ${org.name}.` : "Un vistazo rápido al estado de tus herramientas."}
          </Text>
        </View>
        {canReports ? (
          <View style={styles.filters}>
            {PRESETS.map((p) => (
              <Chip key={p} label={PRESET_LABEL[p]} selected={preset === p} onPress={() => setPreset(p)} />
            ))}
            <Pressable onPress={resetFilters} style={styles.reset} accessibilityRole="button" accessibilityLabel="Restablecer filtros">
              <Text style={styles.resetText}>RESTABLECER</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {canReports ? (
        <View style={[styles.selects, wide && styles.selectsWide]}>
          <View style={styles.flex}>
            <SelectField
              label="Categoría"
              value={categoryId ?? ALL}
              onChange={(v) => setCategoryId(v === ALL ? undefined : v)}
              options={[{ value: ALL, label: "Todas" }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </View>
          <View style={styles.flex}>
            <SelectField
              label="Ubicación actual"
              value={locationId ?? ALL}
              onChange={(v) => setLocationId(v === ALL ? undefined : v)}
              options={[
                { value: ALL, label: "Todas" },
                ...(locations.data ?? []).map((l) => ({ value: l.id, label: l.name, description: l.type === "BODEGA" ? "Bodega" : "Proyecto" })),
              ]}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {can("transfers:create") ? (
          <QuickAction icon="swap-horizontal" label="Nuevo traslado" primary onPress={() => router.push("/transfer/new")} />
        ) : null}
        <QuickAction icon="qr-code-outline" label="Escanear" onPress={() => router.push("/scan")} />
        {can("tools:write") ? <QuickAction icon="add-circle-outline" label="Agregar" onPress={() => router.push("/tool/new")} /> : null}
      </View>

      {/* Lo que está en camino: la carga del chofer, lo que espera quien recibe y, para supervisores, todo. */}
      {user?.role === "CHOFER" ? <PendingCard title="Mi carga" icon="car-outline" filter={{ driverId: user.id }} /> : null}
      {can("transfers:receive") && user?.role !== "CHOFER" && user?.organization ? (
        <PendingCard title="Por recibir" icon="download-outline" filter={{ receivedById: user.id }} />
      ) : null}
      {can("transfers:override") ? <PendingCard title="En camino" icon="navigate-outline" filter={{}} /> : null}

      {canReports ? (
        <>
          <ErrorBanner error={summary.error ?? spend.error ?? byCategory.error} />

          {/* Indicadores: cada uno abre los registros que lo forman. Compras y dañadas van por separado. */}
          <View style={styles.kpis}>
            {values ? (
              <>
                <KpiCard
                  label="Valor del inventario"
                  icon="cash-outline"
                  value={s ? formatMoney(s.inventoryValue) : "—"}
                  caption={s ? `${pctText(pct(inventory, purchaseTotal))} del valor comprado sigue en uso` : undefined}
                  meter={{ ratio: pct(inventory, purchaseTotal), color: colors.success, track: colors.successSoft }}
                  onPress={() => open("Inventario en uso", { metric: "inventory" })}
                />
                <KpiCard
                  label="Compras del periodo"
                  icon="cart-outline"
                  value={s ? formatMoney(s.purchases.value) : "—"}
                  caption={s ? `${s.purchases.count} herramienta(s) · ${PRESET_LABEL[preset].toLowerCase()}` : undefined}
                  onPress={() => open(`Compras · ${PRESET_LABEL[preset]}`, { metric: "purchases", range: true })}
                />
                <KpiCard
                  label="Dañadas (valor de compra)"
                  icon="construct-outline"
                  value={s ? formatMoney(s.damaged.value) : "—"}
                  caption={s ? `${s.damaged.count} hoy · valor de adquisición, no pérdida calculada` : undefined}
                  meter={{ ratio: pct(Number(s?.damaged.value ?? 0), purchaseTotal), color: statusColors.DANADA.fg, track: statusColors.DANADA.bg }}
                  onPress={() => open("Herramientas dañadas", { metric: "tools", status: "DANADA" })}
                />
                <KpiCard
                  label="Extraviadas (valor de compra)"
                  icon="help-buoy-outline"
                  value={s ? formatMoney(s.byStatus.EXTRAVIADA.value) : "—"}
                  caption={s ? `${s.byStatus.EXTRAVIADA.count} hoy · valor de adquisición` : undefined}
                  meter={{
                    ratio: pct(Number(s?.byStatus.EXTRAVIADA.value ?? 0), purchaseTotal),
                    color: colors.danger,
                    track: colors.dangerSoft,
                  }}
                  onPress={() => open("Herramientas extraviadas", { metric: "tools", status: "EXTRAVIADA" })}
                />
              </>
            ) : (
              <>
                <KpiCard
                  label="Dañadas"
                  icon="construct-outline"
                  value={counts ? String(counts.DANADA) : "—"}
                  caption="Requieren reparación o baja"
                  onPress={() => open("Herramientas dañadas", { metric: "tools", status: "DANADA" })}
                />
                <KpiCard
                  label="Extraviadas"
                  icon="help-buoy-outline"
                  value={counts ? String(counts.EXTRAVIADA) : "—"}
                  caption="Sin ubicación conocida"
                  onPress={() => open("Herramientas extraviadas", { metric: "tools", status: "EXTRAVIADA" })}
                />
              </>
            )}
            <KpiCard
              label="Disponibles en bodega"
              icon="home-outline"
              value={counts ? pctText(pct(counts.BODEGA, total)) : "—"}
              caption={counts ? `${counts.BODEGA} de ${total} herramientas` : undefined}
              meter={{ ratio: pct(counts?.BODEGA ?? 0, total), color: statusColors.BODEGA.fg, track: statusColors.BODEGA.bg }}
              onPress={() => open("Disponibles en bodega", { metric: "tools", status: "BODEGA" })}
            />
            <KpiCard
              label="En uso en proyectos"
              icon="business-outline"
              value={counts ? pctText(pct(counts.EN_PROYECTO, total)) : "—"}
              caption={counts ? `${counts.EN_PROYECTO} en obra · ${counts.EN_TRANSITO} en camino` : undefined}
              meter={{ ratio: pct(counts?.EN_PROYECTO ?? 0, total), color: statusColors.EN_PROYECTO.fg, track: statusColors.EN_PROYECTO.bg }}
              onPress={() => open("En uso en proyectos", { metric: "tools", status: "EN_PROYECTO" })}
            />
          </View>

          {/* Anillos + tendencia */}
          <View style={[styles.row, wide && styles.rowWide]}>
            <Panel title="Por estado" subtitle="Estado actual" style={wide ? styles.colDonut : undefined}>
              <DonutChart
                segments={statusSegments}
                centerValue={counts ? String(total) : "—"}
                centerLabel="herramientas"
                onOpen={(k) => open(statusLabel(k as ToolStatus), { metric: "tools", status: k as ToolStatus })}
                openLabel={(seg) => `Ver las ${seg.value} herramienta(s)`}
              />
            </Panel>
            <Panel title="Por proyecto" subtitle="Herramientas asignadas hoy" style={wide ? styles.colDonut : undefined}>
              {projects.length ? (
                <DonutChart
                  segments={projectSegments}
                  centerValue={String(projects.length)}
                  centerLabel={projects.length === 1 ? "proyecto" : "proyectos"}
                  onOpen={(k) => {
                    const p = projects.find((x) => x.locationId === k);
                    if (p) openReportDetail(`Herramientas en ${p.name}`, { metric: "tools", categoryId, locationId: p.locationId });
                  }}
                  openLabel={(seg) => (seg.key === "__other" ? "Elige un proyecto de la lista" : `Ver las ${seg.value} herramienta(s)`)}
                />
              ) : (
                <Text style={font.small}>Ningún proyecto tiene herramientas con estos filtros.</Text>
              )}
              {projectTools === 0 && projects.length ? <Text style={font.small}>Ningún proyecto tiene herramientas.</Text> : null}
            </Panel>
            {values ? (
              <Panel
                title="Gasto en el tiempo"
                subtitle={PRESET_LABEL[preset]}
                style={wide ? styles.colTrend : undefined}
                footer={
                  <View style={styles.segmented}>
                    {(Object.keys(TREND_LABEL) as Trend[]).map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setTrend(t)}
                        style={[styles.segment, trend === t && styles.segmentActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: trend === t }}
                      >
                        <Text style={[styles.segmentText, trend === t && styles.segmentTextActive]}>{TREND_LABEL[t]}</Text>
                      </Pressable>
                    ))}
                  </View>
                }
              >
                {spend.data ? (
                  <StackedBarChart
                    series={trendSeries[trend]}
                    columns={trendColumns}
                    height={wide ? 200 : 150}
                    onOpen={(col, si) => {
                      const row = spend.data?.[col];
                      const metric = trendMetrics[trend][si];
                      if (!row || !metric) return;
                      openReportDetail(`${metric === "purchases" ? "Compras" : "Mantenimiento"} · ${trendColumns[col]?.fullLabel ?? ""}`, {
                        metric,
                        period: row.period,
                        granularity: period.granularity,
                        categoryId,
                        locationId,
                      });
                    }}
                  />
                ) : null}
              </Panel>
            ) : null}
          </View>

          {/* Categorías + top proyectos */}
          <View style={[styles.row, wide && styles.rowWide]}>
            {values ? (
              <Panel title="Compras por categoría" subtitle={`Valor de adquisición · ${PRESET_LABEL[preset]}`} style={wide ? styles.colWide : undefined}>
                {byCategory.data ? (
                  <HBarChart
                    color={chart.series1}
                    rows={byCategory.data.map((c) => ({
                      key: c.categoryId,
                      label: c.category,
                      value: Number(c.purchaseTotal),
                      caption: `${c.purchasedCount} comprada(s)${Number(c.maintenanceTotal) > 0 ? ` · mantenimiento aparte: ${formatMoney(c.maintenanceTotal)}` : ""}`,
                    }))}
                    max={6}
                    onPress={(key) => {
                      const c = byCategory.data?.find((x) => x.categoryId === key);
                      open(`Compras de ${c?.category ?? "la categoría"} · ${PRESET_LABEL[preset]}`, {
                        metric: "purchases",
                        range: true,
                        categoryId: key,
                      });
                    }}
                  />
                ) : null}
              </Panel>
            ) : null}
            <Panel title="Top 5 proyectos" subtitle="Por herramientas asignadas" style={wide ? styles.colNarrow : undefined}>
              <TopProjects
                projects={projects.slice(0, 5)}
                totalTools={total}
                onOpen={(p) => openReportDetail(`Herramientas en ${p.name}`, { metric: "tools", categoryId, locationId: p.locationId })}
              />
            </Panel>
          </View>

          {counts && counts.DANADA + counts.EXTRAVIADA > 0 ? (
            <Card style={styles.alert}>
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={22} color={colors.danger} />
                <Text style={[font.body, styles.flex]}>Requieren seguimiento</Text>
              </View>
              {counts.EXTRAVIADA > 0 ? (
                <Pressable style={styles.pendingRow} onPress={() => open("Herramientas extraviadas", { metric: "tools", status: "EXTRAVIADA" })}>
                  <Text style={[font.body, styles.flex]}>{counts.EXTRAVIADA} extraviada(s)</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
              {counts.DANADA > 0 ? (
                <Pressable style={styles.pendingRow} onPress={() => open("Herramientas dañadas", { metric: "tools", status: "DANADA" })}>
                  <Text style={[font.body, styles.flex]}>{counts.DANADA} dañada(s)</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

/** Tarjeta de sección del tablero: título, subtítulo y pie opcional (p. ej. un selector). */
function Panel({
  title,
  subtitle,
  footer,
  style,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  style?: object;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { font } = useTheme();
  return (
    <View style={[styles.panel, style]}>
      <View>
        <Text style={styles.panelTitle}>{title}</Text>
        {subtitle ? <Text style={font.small}>{subtitle}</Text> : null}
      </View>
      {children}
      {footer}
    </View>
  );
}

type ProjectRow = { locationId: string; name: string; count: number };

/** Tabla de proyectos con más herramientas (números alineados en columnas). */
function TopProjects({ projects, totalTools, onOpen }: { projects: ProjectRow[]; totalTools: number; onOpen(p: ProjectRow): void }) {
  const styles = useStyles();
  const { font } = useTheme();
  if (projects.length === 0) return <Text style={font.small}>Aún no hay proyectos con herramientas.</Text>;
  return (
    <View>
      <View style={[styles.tr, styles.thead]}>
        <Text style={[styles.th, styles.rank]}>#</Text>
        <Text style={[styles.th, styles.flex]}>Proyecto</Text>
        <Text style={[styles.th, styles.num]}>Herr.</Text>
        <Text style={[styles.th, styles.num]}>% total</Text>
      </View>
      {projects.map((p, i) => (
        <Pressable key={p.locationId} style={styles.tr} onPress={() => onOpen(p)} accessibilityRole="button">
          <Text style={[styles.td, styles.rank]}>{i + 1}</Text>
          <Text style={[styles.td, styles.flex, styles.tdName]} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={[styles.td, styles.num]}>{p.count}</Text>
          <Text style={[styles.td, styles.num]}>{pctText(pct(p.count, totalTools))}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Traslados en tránsito según el filtro; se oculta si no hay ninguno. */
function PendingCard({ title, icon, filter }: { title: string; icon: ComponentProps<typeof Ionicons>["name"]; filter: PendingFilter }) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const q = usePendingTransfers(filter);
  const list = q.data ?? [];
  if (list.length === 0) return null;
  const late = list.filter((t) => Date.now() - new Date(t.movedAt).getTime() > LATE_HOURS * 3_600_000).length;
  return (
    <Card style={{ ...styles.pending, borderLeftColor: late ? colors.danger : colors.transit }}>
      <View style={styles.alertRow}>
        <Ionicons name={icon} size={22} color={late ? colors.danger : colors.transit} />
        <Text style={[font.h2, styles.flex]}>
          {title} ({list.length})
        </Text>
        {late ? <Text style={[font.small, { color: colors.danger, fontWeight: "700" }]}>{late} con más de 1 día</Text> : null}
      </View>
      {list.slice(0, 5).map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/transfer/${t.id}`)} style={styles.pendingRow}>
          <Text style={[font.body, styles.flex]} numberOfLines={1}>
            {t.fromLocation.name} → {t.toLocation.name}
          </Text>
          <Text style={font.small}>
            {t._count.items} herr. · {t.driver?.name ?? ""}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress(): void;
  primary?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={24} color={primary ? colors.onPrimary : colors.text} />
      <Text style={[styles.actionLabel, primary && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, chart }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, gap: space.lg },
    contentWide: { padding: space.xl, maxWidth: 1400, width: "100%", alignSelf: "center" },
    flex: { flex: 1 },

    header: { gap: space.md },
    headerWide: { flexDirection: "row", alignItems: "center" },
    title: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: 0.5, textTransform: "uppercase" },
    subtitleStrong: { fontWeight: "700", fontStyle: "italic", color: colors.text },
    filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
    selects: { gap: space.sm },
    selectsWide: { flexDirection: "row", gap: space.lg },
    // Invertido según el tema: tinta de texto como fondo.
    reset: { backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
    resetText: { color: colors.surface, fontSize: 12, fontWeight: "800", letterSpacing: 1 },

    actions: { flexDirection: "row", gap: space.md },
    action: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: space.md,
      alignItems: "center",
      gap: space.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
    actionLabel: { fontSize: 13, fontWeight: "700", color: colors.text },

    kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },

    row: { gap: space.lg },
    rowWide: { flexDirection: "row", alignItems: "stretch" },
    colDonut: { flex: 1, minWidth: 220 },
    colTrend: { flex: 2, minWidth: 320 },
    colWide: { flex: 3, minWidth: 320 },
    colNarrow: { flex: 2, minWidth: 280 },

    panel: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    panelTitle: { fontSize: 16, fontWeight: "800", color: colors.text },

    segmented: { flexDirection: "row", alignSelf: "center", backgroundColor: colors.neutralSoft, borderRadius: radius.pill, padding: 3 },
    segment: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
    segmentActive: { backgroundColor: colors.text },
    segmentText: { fontSize: 12, fontWeight: "700", color: chart.inkSecondary },
    segmentTextActive: { color: colors.surface },

    tr: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    thead: { backgroundColor: colors.neutralSoft, borderRadius: radius.sm, paddingHorizontal: space.xs, borderBottomWidth: 0 },
    th: { fontSize: 12, fontWeight: "800", color: chart.inkSecondary },
    td: { fontSize: 13, color: colors.text },
    tdName: { fontWeight: "600" },
    rank: { width: 22, textAlign: "center" },
    num: { width: 64, textAlign: "right", fontVariant: ["tabular-nums"] },

    alert: { borderLeftWidth: 4, borderLeftColor: colors.danger },
    alertRow: { flexDirection: "row", alignItems: "center", gap: space.md },
    pending: { borderLeftWidth: 4 },
    pendingRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  }),
);
