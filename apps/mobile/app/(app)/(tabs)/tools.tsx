import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { TOOL_STATUS, TOOL_STATUS_LABEL, type ToolStatus } from "@tt/shared";
import { ToolCard } from "@/components/domain/ToolCard";
import { Chip } from "@/components/ui/Chip";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLocations } from "@/features/catalog/api";
import { useToolsInfinite } from "@/features/tools/api";
import { useDebounced } from "@/lib/useDebounced";
import { radius, space, makeStyles, useTheme } from "@/theme";

export default function ToolsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { can } = useAuth();
  const params = useLocalSearchParams<{ status?: ToolStatus; locationId?: string }>();
  const [status, setStatus] = useState<ToolStatus | undefined>(params.status);
  const [locationId, setLocationId] = useState<string | undefined>(params.locationId);
  const [q, setQ] = useState("");
  const query = useToolsInfinite({ status, locationId, q: useDebounced(q.trim()) || undefined });
  const location = useLocations().data?.find((l) => l.id === locationId);
  const tools = query.data?.pages.flatMap((p) => p.data) ?? [];

  // El dashboard navega aquí con ?status=… y la lista de proyectos con ?locationId=…
  useEffect(() => {
    if (params.status) setStatus(params.status);
  }, [params.status]);
  useEffect(() => {
    if (params.locationId) setLocationId(params.locationId);
  }, [params.locationId]);

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Código, marca, modelo o serie"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="characters"
            returnKeyType="search"
          />
          <Pressable onPress={() => router.push("/scan")} hitSlop={10} accessibilityLabel="Escanear código QR">
            <Ionicons name="qr-code-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {locationId ? (
            <Chip
              label={`${location?.name ?? "Ubicación"}  ✕`}
              selected
              onPress={() => {
                setLocationId(undefined);
                router.setParams({ locationId: undefined });
              }}
            />
          ) : null}
          <Chip label="Todas" selected={!status} onPress={() => setStatus(undefined)} />
          {TOOL_STATUS.map((s) => (
            <Chip
              key={s}
              label={TOOL_STATUS_LABEL[s].replace(" (disponible)", "")}
              selected={status === s}
              onPress={() => setStatus(status === s ? undefined : s)}
            />
          ))}
        </ScrollView>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={tools}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ToolCard tool={item} onPress={() => router.push(`/tool/${item.id}`)} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={query.refetch}
          ListHeaderComponent={<ErrorBanner error={query.error} />}
          ListEmptyComponent={<EmptyState icon="hammer-outline" title="Sin herramientas" />}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
        />
      )}

      {can("tools:write") ? <Fab onPress={() => router.push("/tool/new")} accessibilityLabel="Agregar herramienta" /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    searchWrap: { backgroundColor: colors.surface, paddingTop: space.md, gap: space.sm, paddingBottom: space.sm },
    search: {
      marginHorizontal: space.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      backgroundColor: colors.neutralSoft,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      minHeight: 44,
    },
    input: { flex: 1, fontSize: 15, color: colors.text },
    chips: { gap: space.sm, paddingHorizontal: space.lg },
    list: { padding: space.lg, gap: space.md, paddingBottom: 96 },
  }),
);
