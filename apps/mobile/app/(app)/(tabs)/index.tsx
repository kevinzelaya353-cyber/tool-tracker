import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, type ComponentProps } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { TOOL_STATUS_LABEL, type ToolStatus } from "@tt/shared";
import { Card } from "@/components/ui/Card";
import { ErrorBanner } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { presetRange, toSpendColumns, useReportSummary, useSpendOverTime } from "@/features/reports/api";
import { usePendingTransfers, type PendingFilter } from "@/features/transfers/api";
import { formatMoney } from "@/lib/format";
import { radius, space, makeStyles, useTheme } from "@/theme";

const STATUS_ORDER: ToolStatus[] = ["BODEGA", "EN_PROYECTO", "EN_TRANSITO", "EN_MANTENIMIENTO", "DANADA", "EXTRAVIADA"];

/** Más de esto en camino se marca como atrasado. */
const LATE_HOURS = 24;

export default function Dashboard() {
  const styles = useStyles();
  const { colors, font, chart, statusColors } = useTheme();
  const { user, can } = useAuth();
  const canReports = can("reports:read");
  const summary = useReportSummary(canReports);
  const countsData = useMemo(
    () =>
      summary.data
        ? (Object.fromEntries(STATUS_ORDER.map((s) => [s, summary.data!.byStatus[s].count])) as Record<ToolStatus, number>)
        : undefined,
    [summary.data],
  );
  const counts = { data: countsData, error: summary.error, isRefetching: summary.isRefetching, refetch: summary.refetch };
  const total = counts.data ? STATUS_ORDER.reduce((s, k) => s + counts.data![k], 0) : 0;

  const last12 = useMemo(() => presetRange("12m"), []);
  const spend = useSpendOverTime(last12.range, last12.granularity, canReports);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={counts.isRefetching} onRefresh={counts.refetch} />}
    >
      <View>
        <Text style={font.small}>Hola,</Text>
        <Text style={font.title}>{user?.name}</Text>
      </View>

      <View style={styles.actions}>
        {can("transfers:create") ? (
          <QuickAction icon="swap-horizontal" label="Nuevo traslado" primary onPress={() => router.push("/transfer/new")} />
        ) : null}
        <QuickAction icon="qr-code-outline" label="Escanear" onPress={() => router.push("/scan")} />
        {can("tools:write") ? <QuickAction icon="add-circle-outline" label="Agregar" onPress={() => router.push("/tool/new")} /> : null}
      </View>

      {/* Lo que está en camino: la carga del chofer, lo que espera quien recibe y, para supervisores, todo. */}
      {user?.role === "CHOFER" ? <PendingCard title="Mi carga" icon="car-outline" filter={{ driverId: user.id }} /> : null}
      {can("transfers:receive") && user?.role !== "CHOFER" ? (
        <PendingCard title="Por recibir" icon="download-outline" filter={{ receivedById: user!.id }} />
      ) : null}
      {can("transfers:override") ? <PendingCard title="En camino" icon="navigate-outline" filter={{}} /> : null}

      <ErrorBanner error={counts.error} />

      {canReports ? (
      <Card>
        <View style={styles.totalRow}>
          <Text style={font.h2}>Inventario</Text>
          <Text style={styles.total}>{counts.data ? total : "—"}</Text>
        </View>
        {summary.data ? (
          <Text style={font.small}>
            Valor vigente {formatMoney(summary.data.inventoryValue)} · Pérdidas {formatMoney(summary.data.lossValue)}
          </Text>
        ) : null}
        {/* Barra proporcional por estado */}
        <View style={styles.bar}>
          {countsData && total > 0
            ? STATUS_ORDER.map((s) =>
                countsData[s] > 0 ? (
                  <View key={s} style={{ flex: countsData[s], backgroundColor: statusColors[s].fg }} />
                ) : null,
              )
            : null}
        </View>
        <View style={styles.grid}>
          {STATUS_ORDER.map((s) => (
            <Pressable
              key={s}
              style={[styles.stat, { backgroundColor: statusColors[s].bg }]}
              onPress={() => router.push({ pathname: "/tools", params: { status: s } })}
            >
              <Text style={[styles.statValue, { color: statusColors[s].fg }]}>{counts.data?.[s] ?? "—"}</Text>
              <Text style={[styles.statLabel, { color: statusColors[s].fg }]}>
                {TOOL_STATUS_LABEL[s].replace(" (disponible)", "")}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
      ) : null}

      {spend.data ? (
        <Card>
          <View style={styles.totalRow}>
            <Text style={font.h2}>Gasto últimos 12 meses</Text>
            <Pressable onPress={() => router.push("/reports")} hitSlop={8}>
              <Text style={styles.link}>Ver reportes</Text>
            </Pressable>
          </View>
          <StackedBarChart
            height={130}
            series={[
              { name: "Compras", color: chart.series1 },
              { name: "Mantenimiento", color: chart.series2 },
            ]}
            columns={toSpendColumns(spend.data, "month")}
          />
        </Card>
      ) : null}

      {counts.data && counts.data.DANADA + counts.data.EXTRAVIADA > 0 ? (
        <Card style={styles.alert} onPress={() => router.push({ pathname: "/tools", params: { status: "EXTRAVIADA" } })}>
          <View style={styles.alertRow}>
            <Ionicons name="warning-outline" size={22} color={colors.danger} />
            <Text style={[font.body, styles.flex]}>
              {counts.data.EXTRAVIADA} extraviada(s) y {counts.data.DANADA} dañada(s) requieren seguimiento.
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Card>
      ) : null}
    </ScrollView>
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
      <Ionicons name={icon} size={26} color={primary ? colors.onPrimary : colors.text} />
      <Text style={[styles.actionLabel, primary && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, gap: space.lg },
    flex: { flex: 1 },
    actions: { flexDirection: "row", gap: space.md },
    action: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: space.lg,
      alignItems: "center",
      gap: space.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
    actionLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
    totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    total: { fontSize: 28, fontWeight: "800", color: colors.text },
    bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.neutralSoft },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
    stat: { width: "48%", flexGrow: 1, borderRadius: radius.md, padding: space.md },
    statValue: { fontSize: 22, fontWeight: "800" },
    statLabel: { fontSize: 12, fontWeight: "600" },
    link: { color: colors.primaryDark, fontWeight: "700" },
    alert: { borderLeftWidth: 4, borderLeftColor: colors.danger },
    alertRow: { flexDirection: "row", alignItems: "center", gap: space.md },
    pending: { borderLeftWidth: 4 },
    pendingRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  }),
);
