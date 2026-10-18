import { Ionicons } from "@expo/vector-icons";
import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { ROLE_LABEL } from "@/lib/format";
import { radius, space } from "@/theme";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/**
 * Panel lateral oscuro para pantallas anchas (web/tableta), en lugar de las pestañas de abajo.
 * Es oscuro en ambos temas: enmarca el contenido como un tablero. Usa los mismos destinos que las pestañas.
 */
const C = {
  bg: "#111827",
  item: "#CBD5E1",
  itemMuted: "#94A3B8",
  activeBg: "#1F2937",
  accent: "#F59E0B",
  border: "#1F2937",
};

export function Sidebar({ state, descriptors, navigation }: TabBarProps) {
  const { user } = useAuth();
  const initials = (user?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View style={styles.root}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="construct" size={26} color="#1F1300" />
        </View>
        <Text style={styles.brandText}>Control de{"\n"}Herramientas</Text>
      </View>

      <View style={styles.nav}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          // Pestañas ocultas con href: null (p. ej. Reportes sin permiso).
          if ((options.tabBarItemStyle as StyleProp<ViewStyle> & { display?: string })?.display === "none") return null;
          const focused = state.index === index;
          const label = typeof options.title === "string" ? options.title : route.name;
          const color = focused ? "#FFFFFF" : C.item;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ hovered }: { hovered?: boolean }) => [styles.item, (focused || hovered) && styles.itemActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              <View style={[styles.marker, focused && { backgroundColor: C.accent }]} />
              {options.tabBarIcon?.({ focused, color, size: 20 })}
              <Text style={[styles.itemText, { color }, focused && styles.itemTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.user}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.userName} numberOfLines={1}>
            {user?.name}
          </Text>
          <Text style={styles.userRole} numberOfLines={1}>
            {user ? ROLE_LABEL[user.role] : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 232,
    backgroundColor: C.bg,
    paddingVertical: space.xl,
    paddingHorizontal: space.md,
    justifyContent: "space-between",
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  brand: { alignItems: "center", gap: space.sm, marginBottom: space.xl },
  logo: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  brandText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15, textAlign: "center", lineHeight: 19 },
  nav: { flex: 1, gap: space.xs, justifyContent: "center" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  itemActive: { backgroundColor: C.activeBg },
  marker: { position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2 },
  itemText: { fontSize: 15, fontWeight: "600" },
  itemTextActive: { fontWeight: "800" },
  user: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: C.border },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#374151", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontWeight: "800" },
  flex: { flex: 1 },
  userName: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  userRole: { color: C.itemMuted, fontSize: 12 },
});
