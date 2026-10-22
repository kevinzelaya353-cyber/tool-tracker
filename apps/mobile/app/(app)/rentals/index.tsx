import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { RENTAL_STATUS_LABEL, type RentalStatus } from "@tt/shared";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRentalsInfinite } from "@/features/rentals/api";
import { formatDate } from "@/lib/format";
import { space, makeStyles, useTheme } from "@/theme";

/** Herramientas rentadas: períodos activos (con su vencimiento) y el historial de los ya devueltos. */
export default function RentalsScreen() {
  const styles = useStyles();
  const { font, colors } = useTheme();
  const { can } = useAuth();
  const [status, setStatus] = useState<RentalStatus | undefined>("ACTIVO");
  const query = useRentalsInfinite({ status });
  const rentals = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
        <Chip label="En alquiler" selected={status === "ACTIVO"} onPress={() => setStatus("ACTIVO")} />
        <Chip label="Devueltos" selected={status === "DEVUELTO"} onPress={() => setStatus("DEVUELTO")} />
        <Chip label="Todos" selected={!status} onPress={() => setStatus(undefined)} />
      </ScrollView>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={rentals}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={query.refetch}
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          ListHeaderComponent={<ErrorBanner error={query.error} />}
          renderItem={({ item }) => {
            const overdue = item.status === "ACTIVO" && !!item.expectedReturnAt && new Date(item.expectedReturnAt).getTime() < Date.now();
            return (
              <Card onPress={() => router.push(`/rental/${item.id}`)}>
                <Text style={styles.code}>{item.tool.code}</Text>
                <Text style={font.body} numberOfLines={1}>
                  {item.tool.category.name} · {item.tool.brand}
                  {item.tool.model ? ` ${item.tool.model}` : ""}
                </Text>
                <Text style={font.small}>
                  {item.lessor} · desde {formatDate(item.receivedAt)}
                  {item.returnedAt ? ` hasta ${formatDate(item.returnedAt)}` : ""}
                </Text>
                {item.status === "ACTIVO" ? (
                  <Text style={[font.small, overdue && { color: colors.danger, fontWeight: "700" }]}>
                    {item.expectedReturnAt ? `Devolver el ${formatDate(item.expectedReturnAt)}${overdue ? " (vencido)" : ""}` : "Sin fecha de devolución"}
                    {" · "}
                    {item.location.name}
                  </Text>
                ) : (
                  <Text style={font.small}>{RENTAL_STATUS_LABEL[item.status] ?? item.status}</Text>
                )}
                <StatusBadge status={item.tool.status} />
              </Card>
            );
          }}
          ListEmptyComponent={<EmptyState icon="file-tray-outline" title="Sin alquileres" />}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
        />
      )}

      {can("tools:write") ? <Fab onPress={() => router.push("/rental/new")} accessibilityLabel="Recibir herramienta rentada" /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    chipBar: { flexGrow: 0, backgroundColor: colors.surface },
    chips: { gap: space.sm, padding: space.md },
    list: { padding: space.lg, gap: space.md, paddingBottom: 96 },
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
  }),
);
