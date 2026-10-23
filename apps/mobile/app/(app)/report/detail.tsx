import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { TOOL_STATUS, TOOL_STATUS_LABEL, type ReportMetric, type ToolStatus } from "@tt/shared";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { Chip } from "@/components/ui/Chip";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { PERIOD_LABEL, useReportDetails, type DetailParams, type Granularity } from "@/features/reports/api";
import { EVENT_LABEL, formatDate, formatDateUTC, formatMoney } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { makeStyles, radius, space, useTheme } from "@/theme";
import type { ReportDetailRow } from "@tt/shared";

/** Qué representa cada fecha y cada monto según la métrica. */
const METRIC_COPY: Record<ReportMetric, { date: string; value: string }> = {
  tools: { date: "Último cambio de estado", value: "Valor de adquisición" },
  inventory: { date: "Último cambio de estado", value: "Valor de adquisición" },
  purchases: { date: "Fecha de compra", value: "Valor de adquisición" },
  maintenance: { date: "Fecha del gasto", value: "Costo registrado" },
  losses: { date: "Dejó de estar sana", value: "Valor de adquisición" },
};

type Params = Partial<Record<keyof DetailParams | "title", string>>;

/**
 * Registros detrás de una cifra del tablero (barra, segmento, indicador). La API usa la misma
 * definición que el total, así que la cantidad y la suma de aquí coinciden con el gráfico.
 */
export default function ReportDetailScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { can } = useAuth();
  const p = useLocalSearchParams<Params>();
  const metric = (p.metric ?? "tools") as ReportMetric;
  const [status, setStatus] = useState<ToolStatus | undefined>(p.status as ToolStatus | undefined);
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim()) || undefined;
  const values = can("finance:read");

  const params: DetailParams = {
    metric,
    status,
    categoryId: p.categoryId,
    locationId: p.locationId,
    from: p.from,
    to: p.to,
    period: p.period,
    granularity: p.granularity as Granularity | undefined,
    orgId: p.orgId,
    q: search,
  };
  const details = useReportDetails(params);
  const first = details.data?.pages[0];
  const rows = details.data?.pages.flatMap((pg) => pg.rows) ?? [];
  const copy = METRIC_COPY[metric];
  const statusFilter = metric === "tools" || metric === "losses" || metric === "inventory";

  const periodText = p.period
    ? PERIOD_LABEL(p.period, (p.granularity as Granularity) ?? "month")
    : p.from || p.to
      ? `${p.from ? formatDate(p.from) : "inicio"} – ${p.to ? formatDate(p.to) : "hoy"}`
      : metric === "tools" || metric === "inventory"
        ? "Estado actual"
        : "Histórico completo";

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: p.title ?? "Detalle" }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.eventId ?? r.toolId}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => details.hasNextPage && !details.isFetchingNextPage && details.fetchNextPage()}
        refreshing={details.isRefetching && !details.isFetchingNextPage}
        onRefresh={details.refetch}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={font.title}>{p.title ?? "Detalle"}</Text>
            <Text style={font.small}>{periodText}</Text>
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={styles.totalValue}>{first ? first.count : "—"}</Text>
                <Text style={font.small}>{metric === "maintenance" ? "registro(s) de gasto" : "herramienta(s)"}</Text>
              </View>
              {values ? (
                <View style={styles.total}>
                  <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
                    {first ? formatMoney(first.totalValue) : "—"}
                  </Text>
                  <Text style={font.small}>{copy.value}</Text>
                </View>
              ) : null}
            </View>
            {values && metric !== "maintenance" ? (
              <Text style={font.small}>
                Montos a valor de compra registrado: no es una pérdida calculada ni un valor actual.
              </Text>
            ) : null}

            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Buscar por código, marca, modelo, serie o tipo"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="characters"
                returnKeyType="search"
              />
            </View>
            {statusFilter ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Chip label="Todos" selected={!status} onPress={() => setStatus(undefined)} />
                {(metric === "losses" ? (["DANADA", "EXTRAVIADA", "DADA_DE_BAJA"] as ToolStatus[]) : TOOL_STATUS).map((s) => (
                  <Chip
                    key={s}
                    label={TOOL_STATUS_LABEL[s].replace(" (disponible)", "")}
                    selected={status === s}
                    onPress={() => setStatus(status === s ? undefined : s)}
                  />
                ))}
              </ScrollView>
            ) : null}
            <ErrorBanner error={details.error} />
          </View>
        }
        renderItem={({ item }) => <Row row={item} metric={metric} values={values} />}
        ListEmptyComponent={details.isLoading ? <Loading /> : <EmptyState icon="search-outline" title="Sin registros" />}
        ListFooterComponent={details.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
      />
    </View>
  );
}

function Row({ row, metric, values }: { row: ReportDetailRow; metric: ReportMetric; values: boolean }) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const date = row.date ? (metric === "purchases" ? formatDateUTC(row.date) : formatDate(row.date)) : null;
  return (
    <Pressable
      onPress={() => router.push(`/tool/${row.toolId}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`${row.code}, ${row.category} ${row.brand}`}
    >
      <View style={styles.flex}>
        <View style={styles.rowHead}>
          <Text style={styles.code}>{row.code}</Text>
          <StatusBadge status={row.status} />
        </View>
        <Text style={font.body} numberOfLines={1}>
          {row.category} · {row.brand}
          {row.model ? ` ${row.model}` : ""}
        </Text>
        <Text style={font.small} numberOfLines={2}>
          {[
            row.eventType ? EVENT_LABEL[row.eventType] : null,
            date,
            row.location,
            row.description,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {values ? <Text style={styles.amount}>{formatMoney(row.value)}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { padding: space.lg, gap: space.sm, paddingBottom: 64, maxWidth: 1000, width: "100%", alignSelf: "center" },
    header: { gap: space.sm, marginBottom: space.sm },
    totals: { flexDirection: "row", gap: space.md },
    total: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    totalValue: { fontSize: 22, fontWeight: "800", color: colors.text },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    input: { flex: 1, fontSize: 15, color: colors.text },
    chips: { gap: space.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
    flex: { flex: 1, gap: 2 },
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
    amount: { fontSize: 14, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  }),
);
