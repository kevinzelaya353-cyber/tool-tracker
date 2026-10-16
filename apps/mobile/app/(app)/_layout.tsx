import { Stack } from "expo-router";
import { useTheme } from "@/theme";

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerBackTitle: "Atrás",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="tool/[id]" options={{ title: "Herramienta" }} />
      <Stack.Screen name="tool/new" options={{ title: "Nueva herramienta", presentation: "modal" }} />
      <Stack.Screen name="event/new" options={{ title: "Registrar evento", presentation: "modal" }} />
      <Stack.Screen name="transfer/new" options={{ title: "Nuevo traslado" }} />
      <Stack.Screen name="transfer/[id]" options={{ title: "Traslado" }} />
      <Stack.Screen name="scan" options={{ title: "Escanear código", presentation: "fullScreenModal", headerShown: false }} />
    </Stack>
  );
}
