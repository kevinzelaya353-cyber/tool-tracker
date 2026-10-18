import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, type ColorValue } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { useThemePreference } from "@/features/theme/ThemeProvider";
import { space, useTheme } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

/** Alterna claro/oscuro desde cualquier pestaña; la opción "Sistema" está en Perfil. */
function ThemeToggle() {
  const { scheme, colors } = useTheme();
  const { setPreference } = useThemePreference();
  const dark = scheme === "dark";
  return (
    <Pressable
      onPress={() => setPreference(dark ? "light" : "dark")}
      hitSlop={10}
      style={{ paddingHorizontal: space.lg }}
      accessibilityRole="button"
      accessibilityLabel={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <Ionicons name={dark ? "sunny-outline" : "moon-outline"} size={22} color={colors.text} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { can } = useAuth();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerRight: () => <ThemeToggle />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: icon("grid-outline") }} />
      <Tabs.Screen name="tools" options={{ title: "Herramientas", tabBarIcon: icon("hammer-outline") }} />
      <Tabs.Screen name="transfers" options={{ title: "Traslados", tabBarIcon: icon("swap-horizontal-outline") }} />
      {/* El chofer no ve costos: sin permiso de reportes la pestaña no aparece. */}
      <Tabs.Screen
        name="reports"
        options={{ title: "Reportes", tabBarIcon: icon("bar-chart-outline"), href: can("reports:read") ? undefined : null }}
      />
      <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: icon("person-circle-outline") }} />
    </Tabs>
  );
}
