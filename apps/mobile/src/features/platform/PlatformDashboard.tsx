import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { TOOL_STATUS_LABEL, type PlatformOrgStats, type ToolStatus } from "@tt/shared";
import { HBarChart } from "@/components/charts/HBarChart";
import { KpiCard } from "@/components/charts/KpiCard";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import type { DetailParams } from "@/features/reports/api";
import { openReportDetail } from "@/features/reports/navigation";
import { formatMoneyIn } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/theme";
import { usePlatformOverview } from "./api";

const STATUS_COLUMNS: ToolStatus[] = ["BODEGA", "EN_PROYECTO", "EN_TRANSITO", "EN_MANTENIMIENTO", "DANADA", "EXTRAVIADA"];
const count = (v: number) => String(Math.round(v));

/**
 * Tablero global del SuperAdmin: compara organizaciones. Elegir una empresa en cualquier gráfico
 * entra a esa organización (contexto explícito, no la asigna al SuperAdmin) y abre solo sus datos.
 */
export function PlatformDashboard() {
  const styles = useStyles();
  const { font, colors, chart, statusColors } = useTheme();
  const { user, selectOrg } = useAuth();
  const overview = usePlatformOverview();
  const { width } = useWindowDimensions();
  const wide = (width >= 900 ? width - 232 : width) >= 760;
  const o = overview.data;

  if (overview.isLoading) return <Loading />;
  const orgs = o?.byOrganization ?? [];
  const byId = new Map(orgs.map((x) => [x.organizationId, x]));
  const oneCurrency = (o?.currencies.length ?? 0) <= 1;
  const currency = o?.currencies[0] ?? "HNL";

  /** Entra a la organización y abre el detalle con SOLO sus datos. */
  const enter = (orgId: string, then?: { title: string; params: DetailParams }) => {
    const org = byId.get(orgId);
    if (!org) return;
    selectOrg({ id: org.organizationId, name: org.name, currency: org.currency });
    if (then) openReportDetail(`${then.title} · ${org.name}`, then.params);
    else router.navigate("/");
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
      refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={overview.refetch} />}
    >
      <View>
        <Text style={styles.title}>Panel de la plataforma</Text>
        <Text style={font.small}>
          <Text style={styles.strong}>Hola, {user?.name}.</Text> Consolidado global de todas las organizaciones. Toca una empresa para
          entrar a sus datos.
        </Text>
      </View>
      <ErrorBanner error={overview.error} />

      <View style={styles.kpis}>
        <KpiCard
          label="Organizaciones"
          icon="business-outline"
          value={o ? `${o.activeOrganizations} / ${o.organizations}` : "—"}
          caption="activas / total"
          onPress={() => router.navigate("/organizations")}
        />
        <KpiCard
          label="Usuarios con acceso"
          icon="people-outline"
          value={o ? String(o.users) : "—"}
          caption={o ? `${o.activeUsers} activos · ${o.superadmins} SuperAdmin` : undefined}
          onPress={() => router.navigate("/platform-users")}
        />
        <KpiCard label="Herramientas" icon="hammer-outline" value={o ? String(o.tools) : "—"} caption="Consolidado global (sin bajas)" />
        <KpiCard
          label="Actividad (30 días)"
          icon="pulse-outline"
          value={o ? String(o.activity30d) : "—"}
          caption="Acciones auditadas"
          onPress={() => router.navigate("/audit")}
        />
      </View>

      <View style={[styles.row, wide && styles.rowWide]}>
        <Panel title="Herramientas por empresa" subtitle="Toca una empresa para entrar a su tablero">
          <HBarChart
            color={chart.series1}
            format={count}
            rows={orgs.map((x) => ({ key: x.organizationId, label: x.name, value: x.tools, caption: x.active ? undefined : "Desactivada" }))}
            onPress={(id) => enter(id)}
          />
        </Panel>
        <Panel title="Dañadas por empresa" subtitle="Estado actual">
          <HBarChart
            color={statusColors.DANADA.fg}
            format={count}
            emptyText="Ninguna empresa tiene herramientas dañadas"
            rows={orgs.map((x) => ({
              key: x.organizationId,
              label: x.name,
              value: x.damaged.count,
              caption: `Valor de adquisición: ${formatMoneyIn(x.damaged.value, x.currency)}`,
            }))}
            onPress={(id) => enter(id, { title: "Herramientas dañadas", params: { metric: "tools", status: "DANADA" } })}
          />
        </Panel>
      </View>

      <View style={[styles.row, wide && styles.rowWide]}>
        <Panel
          title="Valor de compras por empresa"
          subtitle={oneCurrency ? "Valor de adquisición de herramientas propias (histórico)" : "Monedas distintas: no se consolidan ni se comparan en una escala"}
        >
          {oneCurrency ? (
            <HBarChart
              color={chart.series2}
              format={(v) => formatMoneyIn(v, currency)}
              rows={orgs.map((x) => ({
                key: x.organizationId,
                label: x.name,
                value: Number(x.purchases.value),
                caption: `${x.purchases.count} compradas · inventario en uso ${formatMoneyIn(x.inventoryValue, x.currency)}`,
              }))}
              onPress={(id) => enter(id, { title: "Compras", params: { metric: "purchases" } })}
            />
          ) : (
            orgs.map((x) => (
              <Pressable key={x.organizationId} style={styles.line} onPress={() => enter(x.organizationId, { title: "Compras", params: { metric: "purchases" } })}>
                <Text style={[font.body, styles.flex]}>{x.name}</Text>
                <Text style={styles.amount}>{formatMoneyIn(x.purchases.value, x.currency)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </Panel>
        <Panel title="Actividad de usuarios por empresa" subtitle="Acciones auditadas en los últimos 30 días">
          <HBarChart
            color={chart.series3}
            format={count}
            emptyText="Sin actividad en los últimos 30 días"
            rows={orgs.map((x) => ({ key: x.organizationId, label: x.name, value: x.activity30d, caption: `${x.activeUsers} usuario(s) activos` }))}
            onPress={(id) => router.push({ pathname: "/audit", params: { organizationId: id } })}
          />
        </Panel>
      </View>

      <Panel title="Distribución por estado" subtitle="Toca una cifra para ver esas herramientas">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[styles.tr, styles.thead]}>
              <Text style={[styles.th, styles.orgCol]}>Empresa</Text>
              {STATUS_COLUMNS.map((s) => (
                <Text key={s} style={[styles.th, styles.num]} numberOfLines={2}>
                  {TOOL_STATUS_LABEL[s].replace(" (disponible)", "")}
                </Text>
              ))}
            </View>
            {orgs.map((x) => (
              <StatusRow key={x.organizationId} org={x} onOpen={(s) => enter(x.organizationId, { title: TOOL_STATUS_LABEL[s], params: { metric: "tools", status: s } })} />
            ))}
          </View>
        </ScrollView>
      </Panel>
    </ScrollView>
  );
}

function StatusRow({ org, onOpen }: { org: PlatformOrgStats; onOpen(s: ToolStatus): void }) {
  const styles = useStyles();
  return (
    <View style={styles.tr}>
      <Text style={[styles.td, styles.orgCol, styles.tdName]} numberOfLines={1}>
        {org.name}
      </Text>
      {STATUS_COLUMNS.map((s) =>
        org.byStatus[s] > 0 ? (
          <Pressable key={s} onPress={() => onOpen(s)} style={styles.num} accessibilityRole="button" accessibilityLabel={`${org.name}: ${org.byStatus[s]} ${TOOL_STATUS_LABEL[s]}`}>
            <Text style={[styles.td, styles.link]}>{org.byStatus[s]}</Text>
          </Pressable>
        ) : (
          <Text key={s} style={[styles.td, styles.num, styles.zero]}>
            0
          </Text>
        ),
      )}
    </View>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const styles = useStyles();
  const { font } = useTheme();
  return (
    <View style={styles.panel}>
      <View>
        <Text style={styles.panelTitle}>{title}</Text>
        {subtitle ? <Text style={font.small}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ colors, chart }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, gap: space.lg },
    contentWide: { padding: space.xl, maxWidth: 1400, width: "100%", alignSelf: "center" },
    title: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: 0.5, textTransform: "uppercase" },
    strong: { fontWeight: "700", fontStyle: "italic", color: colors.text },
    kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
    row: { gap: space.lg },
    rowWide: { flexDirection: "row", alignItems: "stretch" },
    flex: { flex: 1 },
    panel: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    panelTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
    line: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
    amount: { fontSize: 14, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
    tr: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    thead: { backgroundColor: colors.neutralSoft, borderRadius: radius.sm, paddingHorizontal: space.xs, borderBottomWidth: 0 },
    th: { fontSize: 12, fontWeight: "800", color: chart.inkSecondary },
    td: { fontSize: 13, color: colors.text, textAlign: "right", fontVariant: ["tabular-nums"] },
    tdName: { fontWeight: "600", textAlign: "left" },
    orgCol: { width: 170 },
    num: { width: 84, alignItems: "flex-end", textAlign: "right" },
    link: { color: colors.primaryDark, fontWeight: "800", textDecorationLine: "underline" },
    zero: { color: chart.muted },
  }),
);
