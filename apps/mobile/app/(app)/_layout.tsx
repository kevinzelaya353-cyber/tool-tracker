import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Pressable } from "react-native";
import { space, useTheme } from "@/theme";

const goHome = () => router.dismissTo("/");

/**
 * Atrás siempre visible: el botón automático desaparece cuando no hay historial
 * (recarga en web, enlace directo o tras un `replace`) y el usuario quedaba atrapado.
 */
function BackButton({ canGoBack }: { canGoBack: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => (canGoBack ? router.back() : goHome())}
      hitSlop={10}
      style={{ paddingRight: space.md }}
      accessibilityRole="button"
      accessibilityLabel="Atrás"
    >
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </Pressable>
  );
}

function HomeButton() {
  const { colors } = useTheme();
  return (
    <Pressable onPress={goHome} hitSlop={10} accessibilityRole="button" accessibilityLabel="Ir al inicio">
      <Ionicons name="home-outline" size={22} color={colors.text} />
    </Pressable>
  );
}

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerBackTitle: "Atrás",
        headerLeft: () => <BackButton canGoBack={navigation.canGoBack()} />,
        headerRight: () => <HomeButton />,
        contentStyle: { backgroundColor: colors.bg },
      })}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="tool/[id]" options={{ title: "Herramienta" }} />
      <Stack.Screen name="tool/new" options={{ title: "Nueva herramienta", presentation: "modal" }} />
      <Stack.Screen name="event/new" options={{ title: "Registrar evento", presentation: "modal" }} />
      <Stack.Screen name="transfer/new" options={{ title: "Nuevo traslado" }} />
      <Stack.Screen name="transfer/[id]" options={{ title: "Traslado" }} />
      <Stack.Screen name="transfer/receive" options={{ title: "Confirmar llegada" }} />
      <Stack.Screen name="locations/index" options={{ title: "Proyectos y bodegas" }} />
      <Stack.Screen name="locations/new" options={{ title: "Nuevo proyecto", presentation: "modal" }} />
      <Stack.Screen name="users/index" options={{ title: "Usuarios" }} />
      <Stack.Screen name="users/edit" options={{ title: "Usuario", presentation: "modal" }} />
      <Stack.Screen name="scan" options={{ title: "Escanear código", presentation: "fullScreenModal", headerShown: false }} />
    </Stack>
  );
}
