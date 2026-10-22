import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { TOOL_STATUS, TOOL_STATUS_LABEL, type ToolOwnership, type ToolStatus } from "@tt/shared";
import { ToolCard } from "@/components/domain/ToolCard";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePhotoUrlMap } from "@/features/media/api";
import { useCategories, useLocations } from "@/features/catalog/api";
import { fetchAllTools, useToolCategoryCounts, useToolsInfinite } from "@/features/tools/api";
import { labelsHtml } from "@/features/tools/qr";
import { notify } from "@/lib/dialogs";
import { printHtml } from "@/lib/print";
import { useDebounced } from "@/lib/useDebounced";
import { radius, space, makeStyles, useTheme } from "@/theme";

export default function ToolsScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { can } = useAuth();
  const params = useLocalSearchParams<{ status?: ToolStatus; locationId?: string }>();
  const [status, setStatus] = useState<ToolStatus | undefined>(params.status);
  const [locationId, setLocationId] = useState<string | undefined>(params.locationId);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [ownership, setOwnership] = useState<ToolOwnership | undefined>();
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim()) || undefined;
  // Sin búsqueda ni categoría elegida se muestran las categorías; al buscar se busca en todas.
  const grouped = !categoryId && !search && !showAll;
  const query = useToolsInfinite({ status, locationId, categoryId, ownership, q: search }, !grouped);
  const counts = useToolCategoryCounts({ status, locationId, ownership }, grouped);
  const location = useLocations().data?.find((l) => l.id === locationId);
  const category = useCategories().data?.find((c) => c.id === categoryId);
  const tools = query.data?.pages.flatMap((p) => p.data) ?? [];
  const thumbs = usePhotoUrlMap(grouped ? [] : tools.map((t) => t.coverPhotoId));
  const listTotal = query.data?.pages[0]?.total ?? 0;
  const [printing, setPrinting] = useState(false);

  /** Hoja con la etiqueta QR de cada herramienta que cumple los filtros actuales. */
  const printLabels = async () => {
    setPrinting(true);
    try {
      const all = await fetchAllTools({ status, locationId, categoryId, ownership, q: search });
      await printHtml(
        labelsHtml(all.map((t) => ({ code: t.code, title: `${t.category.name} ${t.brand}${t.model ? ` ${t.model}` : ""}` }))),
      );
    } catch (e) {
      await notify("No se pudieron imprimir las etiquetas", (e as Error).message);
    } finally {
      setPrinting(false);
    }
  };
  const total = counts.data?.reduce((s, c) => s + c.count, 0) ?? 0;

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
          {categoryId || showAll ? (
            <Chip
              label={`${categoryId ? (category?.name ?? "Categoría") : "Todas las categorías"}  ✕`}
              selected
              onPress={() => {
                setCategoryId(undefined);
                setShowAll(false);
              }}
            />
          ) : null}
          <Chip
            label="Rentadas"
            selected={ownership === "RENTADA"}
            onPress={() => setOwnership(ownership === "RENTADA" ? undefined : "RENTADA")}
          />
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

      {grouped ? (
        counts.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            data={counts.data ?? []}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            refreshing={counts.isRefetching}
            onRefresh={counts.refetch}
            ListHeaderComponent={
              <>
                <ErrorBanner error={counts.error} />
                <Pressable onPress={() => router.push("/rentals")} style={styles.allLink} accessibilityRole="button">
                  <Text style={styles.allText}>Herramientas rentadas y alquileres</Text>
                  <Ionicons name="file-tray-full-outline" size={16} color={colors.primaryDark} />
                </Pressable>
                {total ? (
                  <Pressable onPress={() => setShowAll(true)} style={styles.allLink} accessibilityRole="button">
                    <Text style={styles.allText}>Ver todas ({total})</Text>
                    <Ionicons name="list" size={16} color={colors.primaryDark} />
                  </Pressable>
                ) : null}
              </>
            }
            renderItem={({ item }) => (
              <Card onPress={() => setCategoryId(item.id)}>
                <View style={styles.catRow}>
                  <View style={styles.catIcon}>
                    <Ionicons name="hammer-outline" size={20} color={colors.primaryDark} />
                  </View>
                  <Text style={[font.body, styles.catName]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.catCount}>{item.count}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            )}
            ListEmptyComponent={<EmptyState icon="hammer-outline" title="Sin herramientas" />}
          />
        )
      ) : query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={tools}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ToolCard
              tool={item}
              thumbUrl={item.coverPhotoId ? thumbs[item.coverPhotoId] : undefined}
              onPress={() => router.push(`/tool/${item.id}`)}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={query.refetch}
          ListHeaderComponent={
            <>
              <ErrorBanner error={query.error} />
              {listTotal > 0 ? (
                <Pressable onPress={printLabels} disabled={printing} style={styles.allLink} accessibilityRole="button">
                  {printing ? <ActivityIndicator size="small" color={colors.primaryDark} /> : null}
                  <Text style={styles.allText}>Imprimir etiquetas QR ({listTotal})</Text>
                  <Ionicons name="print-outline" size={16} color={colors.primaryDark} />
                </Pressable>
              ) : null}
            </>
          }
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
    allLink: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.xs, paddingBottom: space.xs },
    allText: { fontSize: 14, fontWeight: "700", color: colors.primaryDark },
    catRow: { flexDirection: "row", alignItems: "center", gap: space.md },
    catIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    catName: { flex: 1, fontWeight: "700" },
    catCount: {
      minWidth: 32,
      textAlign: "center",
      fontSize: 14,
      fontWeight: "800",
      color: colors.text,
      backgroundColor: colors.neutralSoft,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
      paddingVertical: 2,
    },
  }),
);
