import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useOrganizations } from "@/features/platform/api";
import { formatDate } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/theme";

/** Organizaciones de la plataforma (solo SuperAdmin). */
export default function OrganizationsScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { isSuperadmin, selectOrg } = useAuth();
  const orgs = useOrganizations(isSuperadmin);

  if (orgs.isLoading) return <Loading />;
  return (
    <View style={styles.root}>
      <FlatList
        data={orgs.data ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshing={orgs.isRefetching}
        onRefresh={orgs.refetch}
        ListHeaderComponent={<ErrorBanner error={orgs.error} />}
        ListEmptyComponent={<EmptyState icon="business-outline" title="Aún no hay organizaciones" />}
        renderItem={({ item }) => (
          <Card
            style={item.active ? undefined : styles.inactive}
            onPress={() => router.push({ pathname: "/platform/organization", params: { id: item.id } })}
          >
            <View style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: item.brandColor ?? colors.primary }]}>
                <Text style={styles.swatchText}>{item.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[font.body, styles.name]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={font.small}>
                  {item.slug} · {item.currency} · desde {formatDate(item.createdAt)}
                </Text>
              </View>
              {!item.active ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Desactivada</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.row}>
              <Ionicons name="people-outline" size={16} color={colors.textMuted} />
              <Text style={font.small}>{item.users} usuario(s)</Text>
              <Ionicons name="hammer-outline" size={16} color={colors.textMuted} />
              <Text style={[font.small, styles.flex]}>{item.tools} herramienta(s)</Text>
              <Button
                title="Operar"
                icon="enter-outline"
                variant="secondary"
                compact
                disabled={!item.active}
                onPress={() => {
                  selectOrg({ id: item.id, name: item.name, currency: item.currency });
                  router.navigate("/");
                }}
              />
            </View>
          </Card>
        )}
      />
      <Fab onPress={() => router.push("/platform/organization")} accessibilityLabel="Nueva organización" />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { padding: space.lg, gap: space.md, paddingBottom: 96, maxWidth: 1000, width: "100%", alignSelf: "center" },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    flex: { flex: 1 },
    name: { fontWeight: "700" },
    inactive: { opacity: 0.6 },
    swatch: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    swatchText: { color: "#FFFFFF", fontWeight: "900", fontSize: 18 },
    badge: { backgroundColor: colors.neutralSoft, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
    badgeText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  }),
);
