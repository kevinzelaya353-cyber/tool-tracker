import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ROLE, type Role } from "@tt/shared";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { SelectField } from "@/components/ui/SelectField";
import { useOrganizations, usePlatformUsers } from "@/features/platform/api";
import { formatDateTime, ROLE_LABEL } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { makeStyles, radius, space, useTheme } from "@/theme";

const ALL = "__all__";
type Status = "active" | "inactive" | "locked";
const STATUS_LABEL: Record<Status, string> = { active: "Activos", inactive: "Inactivos", locked: "Bloqueados" };

/** Usuarios de todas las organizaciones (solo SuperAdmin), con su organización y estado. */
export default function PlatformUsersScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const params = useLocalSearchParams<{ organizationId?: string }>();
  const [organizationId, setOrganizationId] = useState<string | undefined>(params.organizationId);
  const [role, setRole] = useState<Role | undefined>();
  const [status, setStatus] = useState<Status | undefined>();
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim()) || undefined;
  const orgs = useOrganizations();
  const users = usePlatformUsers({ organizationId, role, status, q: search });

  useEffect(() => {
    if (params.organizationId) setOrganizationId(params.organizationId);
  }, [params.organizationId]);

  return (
    <View style={styles.root}>
      <FlatList
        data={users.data?.data ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        refreshing={users.isRefetching}
        onRefresh={users.refetch}
        ListHeaderComponent={
          <View style={styles.filters}>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Nombre, usuario o correo"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
            <SelectField
              label="Organización"
              value={organizationId ?? ALL}
              onChange={(v) => setOrganizationId(v === ALL ? undefined : v)}
              options={[{ value: ALL, label: "Todas" }, ...(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <Chip key={s} label={STATUS_LABEL[s]} selected={status === s} onPress={() => setStatus(status === s ? undefined : s)} />
              ))}
              {ROLE.map((r) => (
                <Chip key={r} label={ROLE_LABEL[r]} selected={role === r} onPress={() => setRole(role === r ? undefined : r)} />
              ))}
            </ScrollView>
            <ErrorBanner error={users.error} />
            {users.data ? <Text style={font.small}>{users.data.total} usuario(s)</Text> : null}
          </View>
        }
        ListEmptyComponent={users.isLoading ? <Loading /> : <EmptyState icon="people-outline" title="Sin usuarios" />}
        renderItem={({ item }) => (
          <Card
            style={item.active ? undefined : styles.inactive}
            onPress={() => router.push({ pathname: "/platform/user", params: { id: item.id } })}
          >
            <View style={styles.row}>
              <Ionicons
                name={item.role === "SUPERADMIN" ? "shield-checkmark-outline" : "person-circle-outline"}
                size={22}
                color={colors.primaryDark}
              />
              <Text style={[font.body, styles.name]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.lockedAt ? <Badge label="Bloqueado" fg={colors.danger} bg={colors.dangerSoft} /> : null}
              {!item.active ? <Badge label="Inactivo" fg={colors.textMuted} bg={colors.neutralSoft} /> : null}
              {item.mustChangePassword ? <Badge label="Debe cambiar clave" fg={colors.warning} bg={colors.warningSoft} /> : null}
            </View>
            <Text style={font.small}>
              {item.username || item.email ? `@${item.username ?? item.email}` : "Sin acceso a la app"} · {ROLE_LABEL[item.role]} ·{" "}
              {item.organization?.name ?? "Plataforma"}
            </Text>
            {item.lastLoginAt ? <Text style={font.small}>Último ingreso: {formatDateTime(item.lastLoginAt)}</Text> : null}
          </Card>
        )}
      />
      <Fab onPress={() => router.push({ pathname: "/platform/user", params: { organizationId: organizationId ?? "" } })} accessibilityLabel="Nuevo usuario" />
    </View>
  );
}

function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[badge.wrap, { backgroundColor: bg }]}>
      <Text style={[badge.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm },
  text: { fontSize: 12, fontWeight: "700" },
});

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { padding: space.lg, gap: space.md, paddingBottom: 96, maxWidth: 1000, width: "100%", alignSelf: "center" },
    filters: { gap: space.sm },
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
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
    name: { flex: 1, fontWeight: "600" },
    inactive: { opacity: 0.6 },
  }),
);
