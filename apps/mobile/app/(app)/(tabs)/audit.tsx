import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AuditResult } from "@tt/shared";
import { Chip } from "@/components/ui/Chip";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { SelectField } from "@/components/ui/SelectField";
import { useAudit, type AuditFilters } from "@/features/audit/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { useOrganizations, usePlatformUsers } from "@/features/platform/api";
import { useManagedUsers } from "@/features/users/api";
import { formatDateTime } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/theme";
import type { AuditEntry } from "@/types/api";

const ALL = "__all__";
const MODULES: Record<string, string> = {
  auth: "Sesiones",
  user: "Usuarios",
  tool: "Herramientas",
  transfer: "Traslados",
  lifecycle: "Eventos",
  damage: "Daños",
  rental: "Alquileres",
  location: "Ubicaciones",
  media: "Fotos",
  organization: "Organizaciones",
  impersonation: "Soporte",
  access: "Accesos denegados",
};
const RESULT_LABEL: Record<AuditResult, string> = { SUCCESS: "Correcto", FAILURE: "Fallido", DENIED: "Denegado" };
type Since = "1d" | "7d" | "30d" | "all";
const SINCE_LABEL: Record<Since, string> = { "1d": "Hoy", "7d": "7 días", "30d": "30 días", all: "Todo" };
const SINCE_DAYS: Record<Since, number | null> = { "1d": 1, "7d": 7, "30d": 30, all: null };

/**
 * Auditoría. El SuperAdmin sin organización elegida ve TODAS (y filtra por empresa); el
 * administrador de una organización (o el SuperAdmin operando en una) ve solo la de esa organización.
 */
export default function AuditScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { isSuperadmin, org, can } = useAuth();
  const global = isSuperadmin && !org;
  const params = useLocalSearchParams<{ organizationId?: string }>();
  const [organizationId, setOrganizationId] = useState<string | undefined>(params.organizationId);
  const [userId, setUserId] = useState<string | undefined>();
  const [module, setModule] = useState<string | undefined>();
  const [result, setResult] = useState<AuditResult | undefined>();
  const [since, setSince] = useState<Since>("7d");

  useEffect(() => {
    if (params.organizationId) setOrganizationId(params.organizationId);
  }, [params.organizationId]);

  const filters: AuditFilters = useMemo(() => {
    const days = SINCE_DAYS[since];
    return {
      organizationId: global ? organizationId : undefined,
      userId,
      module,
      result,
      from: days ? new Date(Date.now() - days * 86_400_000) : undefined,
    };
  }, [global, organizationId, userId, module, result, since]);

  const allowed = global ? isSuperadmin : can("audit:read");
  const audit = useAudit(filters, global);
  const orgs = useOrganizations(global);
  const platformUsers = usePlatformUsers({ organizationId }, global);
  const orgUsers = useManagedUsers(!global && can("users:manage"));
  const people = global ? (platformUsers.data?.data ?? []) : (orgUsers.data ?? []);
  const rows = audit.data?.pages.flatMap((p) => p.data) ?? [];

  if (!allowed) return <EmptyState icon="lock-closed-outline" title="Sin acceso a la auditoría" />;

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshing={audit.isRefetching && !audit.isFetchingNextPage}
        onRefresh={audit.refetch}
        onEndReachedThreshold={0.4}
        onEndReached={() => audit.hasNextPage && !audit.isFetchingNextPage && audit.fetchNextPage()}
        ListHeaderComponent={
          <View style={styles.filters}>
            <Text style={font.small}>{global ? "Todas las organizaciones" : `Organización: ${org?.name ?? "la tuya"}`}</Text>
            <View style={styles.selects}>
              {global ? (
                <View style={styles.flex}>
                  <SelectField
                    label="Empresa"
                    value={organizationId ?? ALL}
                    onChange={(v) => {
                      setOrganizationId(v === ALL ? undefined : v);
                      setUserId(undefined);
                    }}
                    options={[{ value: ALL, label: "Todas" }, ...(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))]}
                  />
                </View>
              ) : null}
              <View style={styles.flex}>
                <SelectField
                  label="Usuario"
                  value={userId ?? ALL}
                  onChange={(v) => setUserId(v === ALL ? undefined : v)}
                  options={[{ value: ALL, label: "Todos" }, ...people.map((u) => ({ value: u.id, label: u.name, description: u.username ?? undefined }))]}
                />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {(Object.keys(SINCE_LABEL) as Since[]).map((s) => (
                <Chip key={s} label={SINCE_LABEL[s]} selected={since === s} onPress={() => setSince(s)} />
              ))}
              {(Object.keys(RESULT_LABEL) as AuditResult[]).map((r) => (
                <Chip key={r} label={RESULT_LABEL[r]} selected={result === r} onPress={() => setResult(result === r ? undefined : r)} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {Object.entries(MODULES).map(([k, label]) => (
                <Chip key={k} label={label} selected={module === k} onPress={() => setModule(module === k ? undefined : k)} />
              ))}
            </ScrollView>
            <ErrorBanner error={audit.error} />
            {audit.data ? <Text style={font.small}>{audit.data.pages[0]?.total ?? 0} registro(s)</Text> : null}
          </View>
        }
        renderItem={({ item }) => <AuditRow entry={item} showOrg={global} />}
        ListEmptyComponent={audit.isLoading ? <Loading /> : <EmptyState icon="document-text-outline" title="Sin registros con estos filtros" />}
        ListFooterComponent={audit.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
      />
    </View>
  );
}

function AuditRow({ entry, showOrg }: { entry: AuditEntry; showOrg: boolean }) {
  const styles = useStyles();
  const { font, colors } = useTheme();
  const [open, setOpen] = useState(false);
  const tone =
    entry.result === "SUCCESS"
      ? { fg: colors.success, bg: colors.successSoft }
      : entry.result === "DENIED"
        ? { fg: colors.danger, bg: colors.dangerSoft }
        : { fg: colors.warning, bg: colors.warningSoft };
  const support = entry.impersonationId && entry.actor && entry.effectiveUser && entry.actor.id !== entry.effectiveUser.id;
  const who = support
    ? `${entry.actor!.name} (soporte) como ${entry.effectiveUser!.name}`
    : (entry.actor?.name ?? entry.effectiveUser?.name ?? "Sistema / desconocido");

  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={styles.row} accessibilityRole="button">
      <View style={styles.head}>
        <Text style={styles.action}>{entry.action}</Text>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{RESULT_LABEL[entry.result]}</Text>
        </View>
        {support ? (
          <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
            <Text style={[styles.badgeText, { color: colors.warning }]}>Sesión de soporte</Text>
          </View>
        ) : null}
      </View>
      <Text style={font.body}>{who}</Text>
      <Text style={font.small}>
        {formatDateTime(entry.at)}
        {showOrg ? ` · ${entry.organization?.name ?? "Plataforma"}` : ""}
        {` · ${entry.entity}${entry.entityId ? ` ${entry.entityId.slice(0, 8)}…` : ""}`}
        {entry.ip ? ` · IP ${entry.ip}` : ""}
      </Text>
      {open ? (
        <Text style={styles.diff} selectable>
          {JSON.stringify({ detalle: entry.diff, recurso: entry.entityId, dispositivo: entry.userAgent }, null, 2)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { padding: space.lg, gap: space.sm, paddingBottom: 64, maxWidth: 1000, width: "100%", alignSelf: "center" },
    filters: { gap: space.sm, marginBottom: space.sm },
    selects: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
    flex: { flex: 1, minWidth: 200 },
    chips: { gap: space.sm },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      gap: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    head: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
    action: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
    badge: { paddingHorizontal: space.sm, paddingVertical: 1, borderRadius: radius.sm },
    badgeText: { fontSize: 11, fontWeight: "800" },
    diff: { fontFamily: "monospace", fontSize: 11, color: colors.text, backgroundColor: colors.neutralSoft, padding: space.sm, borderRadius: radius.sm, marginTop: space.xs },
  }),
);
