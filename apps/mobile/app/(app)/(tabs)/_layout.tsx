import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Image, Pressable, useWindowDimensions, type ColorValue } from "react-native";
import LOGO from "../../../assets/brand/plexbird-mark.png";
import { Sidebar } from "@/components/layout/Sidebar";
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

/** Logo a la izquierda del encabezado en el teléfono (en pantallas anchas va en el panel lateral). */
function HeaderLogo() {
  return <Image source={LOGO} style={{ width: 30, height: 30, marginLeft: space.lg }} accessibilityLabel="Plexbird" />;
}

/** Desde este ancho (web, tableta horizontal) las pestañas pasan a un panel lateral. */
const SIDEBAR_MIN_WIDTH = 900;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { can } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_MIN_WIDTH;
  return (
    <Tabs
      tabBar={wide ? (props) => <Sidebar {...props} /> : undefined}
      screenOptions={{
        // Transición corta al cambiar de pestaña; el fondo evita un destello blanco en modo oscuro.
        animation: wide ? "fade" : "shift",
        sceneStyle: { backgroundColor: colors.bg },
        tabBarPosition: wide ? "left" : "bottom",
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerLeft: wide ? undefined : () => <HeaderLogo />,
        headerRight: () => <ThemeToggle />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: icon("grid-outline") }} />
      <Tabs.Screen name="tools" options={{ title: "Herramientas", tabBarIcon: icon("hammer-outline") }} />
      <Tabs.Screen name="transfers" options={{ title: "Traslados", tabBarIcon: icon("swap-horizontal-outline") }} />
      <Tabs.Screen name="locations" options={{ title: "Bodegas", headerTitle: "Bodegas y proyectos", tabBarIcon: icon("business-outline") }} />
      {/* El chofer no ve costos: sin permiso de reportes la pestaña no aparece. */}
      <Tabs.Screen
        name="reports"
        options={{ title: "Reportes", tabBarIcon: icon("bar-chart-outline"), href: can("reports:read") ? undefined : null }}
      />
      <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: icon("person-circle-outline") }} />
    </Tabs>
  );
}
