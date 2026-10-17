import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTransfersInfinite } from "@/features/transfers/api";
import { formatDateTime } from "@/lib/format";
import { radius, space, makeStyles, useTheme } from "@/theme";

export default function TransfersScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { can } = useAuth();
  const query = useTransfersInfinite();
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <View style={styles.root}>
      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={query.refetch}
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          ListHeaderComponent={
            <>
              <Pressable style={styles.projects} onPress={() => router.push("/locations")} accessibilityRole="button">
                <Ionicons name="business-outline" size={22} color={colors.primaryDark} />
                <View style={styles.flex}>
                  <Text style={[font.body, styles.place]}>Proyectos y bodegas</Text>
                  <Text style={font.small}>Registrar proyectos con su ubicación</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              <ErrorBanner error={query.error} />
            </>
          }
          ListEmptyComponent={<EmptyState icon="swap-horizontal" title="Aún no hay traslados" />}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/transfer/${item.id}`)}>
              <View style={styles.route}>
                <Text style={[font.body, styles.place]} numberOfLines={1}>{item.fromLocation.name}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primaryDark} />
                <Text style={[font.body, styles.place]} numberOfLines={1}>{item.toLocation.name}</Text>
              </View>
              <Text style={font.small}>
                {formatDateTime(item.movedAt)} · {item._count.items} herramienta(s)
                {item._count.photos ? ` · ${item._count.photos} foto(s)` : ""}
              </Text>
              <Text style={font.small}>
                {item.deliveredBy.name} → {item.receivedBy.name}
                {item.vehicle ? ` · ${item.vehicle.plate}` : ""}
              </Text>
            </Card>
          )}
        />
      )}

      {can("transfers:create") ? (
        <Fab onPress={() => router.push("/transfer/new")} accessibilityLabel="Nuevo traslado" />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { padding: space.lg, gap: space.md, paddingBottom: 96 },
    route: { flexDirection: "row", alignItems: "center", gap: space.sm },
    place: { flexShrink: 1, fontWeight: "700" },
    flex: { flex: 1 },
    projects: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      padding: space.md,
      borderRadius: radius.lg,
      backgroundColor: colors.primarySoft,
    },
  }),
);
