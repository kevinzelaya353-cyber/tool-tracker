import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useManagedUsers } from "@/features/users/api";
import { formatDateTime, ROLE_LABEL } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/theme";
import type { ManagedUser } from "@/types/api";

const hasAccess = (u: ManagedUser) => Boolean(u.username || u.email);

/** Cuentas de la app (y personas sin acceso). Primero las bloqueadas: requieren atención. */
export default function UsersScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const users = useManagedUsers();

  if (users.isLoading) return <Loading />;
  const rank = (u: ManagedUser) => (u.lockedAt ? 0 : !u.active ? 3 : hasAccess(u) ? 1 : 2);
  const sorted = [...(users.data ?? [])].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return (
    <View style={styles.root}>
      <FlatList
        data={sorted}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        refreshing={users.isRefetching}
        onRefresh={users.refetch}
        ListHeaderComponent={<ErrorBanner error={users.error} />}
        ListEmptyComponent={<EmptyState icon="people-outline" title="Aún no hay usuarios" />}
        renderItem={({ item }) => (
          <Card
            style={item.active ? styles.card : { ...styles.card, ...styles.inactive }}
            onPress={() => router.push({ pathname: "/users/edit", params: { id: item.id } })}
          >
            <View style={styles.row}>
              <Ionicons name={hasAccess(item) ? "person-circle-outline" : "person-outline"} size={22} color={colors.primaryDark} />
              <Text style={[font.body, styles.name]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.lockedAt ? <Badge label="Bloqueado" fg={colors.danger} bg={colors.dangerSoft} /> : null}
              {!item.active ? <Badge label="Inactivo" fg={colors.textMuted} bg={colors.neutralSoft} /> : null}
            </View>
            <Text style={font.small}>
              {hasAccess(item) ? `@${item.username ?? item.email} · ${ROLE_LABEL[item.role]}` : "Sin acceso a la app"}
            </Text>
            {item.lastLoginAt ? <Text style={font.small}>Último ingreso: {formatDateTime(item.lastLoginAt)}</Text> : null}
          </Card>
        )}
      />
      <Fab onPress={() => router.push("/users/edit")} accessibilityLabel="Registrar usuario" />
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
    list: { padding: space.lg, gap: space.md, paddingBottom: 96 },
    card: { gap: space.xs },
    inactive: { opacity: 0.6 },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    name: { flex: 1, fontWeight: "600" },
  }),
);
