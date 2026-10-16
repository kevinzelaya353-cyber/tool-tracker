import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTransfersInfinite } from "@/features/transfers/api";
import { formatDateTime } from "@/lib/format";
import { space, makeStyles, useTheme } from "@/theme";

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
          ListHeaderComponent={<ErrorBanner error={query.error} />}
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
        <Pressable style={styles.fab} onPress={() => router.push("/transfer/new")} accessibilityLabel="Nuevo traslado">
          <Ionicons name="add" size={30} color={colors.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { padding: space.lg, gap: space.md, paddingBottom: 96 },
    route: { flexDirection: "row", alignItems: "center", gap: space.sm },
    place: { flexShrink: 1, fontWeight: "700" },
    fab: {
      position: "absolute",
      right: space.lg,
      bottom: space.lg,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...shadow,
      elevation: 6,
    },
  }),
);
