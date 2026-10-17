import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Fab } from "@/components/ui/Fab";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLocations } from "@/features/catalog/api";
import { makeStyles, space, useTheme } from "@/theme";

/** Proyectos y bodegas activos con su dirección; desde aquí se registran nuevos. */
export default function LocationsScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { can } = useAuth();
  const locations = useLocations();
  const canEdit = can("catalog:write");

  if (locations.isLoading) return <Loading />;
  const all = locations.data ?? [];
  const sections = [
    { title: "Proyectos", data: all.filter((l) => l.type === "PROYECTO") },
    { title: "Bodegas", data: all.filter((l) => l.type === "BODEGA") },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        refreshing={locations.isRefetching}
        onRefresh={locations.refetch}
        ListHeaderComponent={<ErrorBanner error={locations.error} />}
        ListEmptyComponent={<EmptyState icon="business-outline" title="Aún no hay proyectos registrados" />}
        renderSectionHeader={({ section }) => <Text style={[font.h2, styles.section]}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => router.push({ pathname: "/tools", params: { locationId: item.id } })}>
            <View style={styles.row}>
              <Ionicons name={item.type === "BODEGA" ? "home-outline" : "construct-outline"} size={20} color={colors.primaryDark} />
              <Text style={[font.body, styles.name]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={font.small}>{item._count?.tools ?? 0} herr.</Text>
              {canEdit ? (
                <Pressable
                  onPress={() => router.push({ pathname: "/locations/new", params: { id: item.id } })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${item.name}`}
                >
                  <Ionicons name="create-outline" size={20} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
            {item.address ? (
              <View style={styles.row}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={[font.small, styles.name]}>{item.address}</Text>
              </View>
            ) : null}
            {item.latitude == null ? (
              <View style={styles.row}>
                <Ionicons name="map-outline" size={14} color={colors.warning} />
                <Text style={[font.small, styles.name]}>Sin punto en el mapa: sus traslados no muestran ruta.</Text>
              </View>
            ) : null}
          </Card>
        )}
      />
      {can("catalog:write") ? <Fab onPress={() => router.push("/locations/new")} accessibilityLabel="Registrar proyecto" /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { padding: space.lg, gap: space.md, paddingBottom: 96 },
    section: { marginTop: space.sm },
    card: { gap: space.xs },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    name: { flex: 1 },
  }),
);
