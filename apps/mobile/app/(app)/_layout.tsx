import { Ionicons } from "@expo/vector-icons";
import { QueryClientProvider } from "@tanstack/react-query";
import { Redirect, router, Stack, usePathname, type ErrorBoundaryProps } from "expo-router";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { SessionBanner } from "@/components/layout/SessionBanner";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { useAuth } from "@/features/auth/AuthProvider";
import { createQueryClient } from "@/lib/queryClient";
import { space, useTheme } from "@/theme";

const goHome = () => router.dismissTo("/");

/** Un error al dibujar una pantalla de la app no la cierra: se puede reintentar o volver al inicio. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorScreen {...props} onHome={goHome} />;
}

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
    <Pressable
      onPress={goHome}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Ir al inicio"
    >
      <Ionicons name="home-outline" size={22} color={colors.text} />
    </Pressable>
  );
}

export default function AppLayout() {
  const { colors } = useTheme();
  const { user, org } = useAuth();
  const pathname = usePathname();
  /**
   * Cada contexto (plataforma, una organización elegida por el SuperAdmin, una sesión de soporte)
   * tiene su propia caché y su propio árbol de pantallas: al cambiar, todo se monta de cero. Ningún
   * dato de otra organización se muestra ni se vuelve a pedir con permisos que ya no corresponden.
   */
  const contextKey = `${user?.id ?? "-"}:${org?.id ?? "-"}`;
  // Una caché nueva por contexto (contextKey es la dependencia a propósito).
  const queryClient = useMemo(createQueryClient, [contextKey]);
  // Credencial restablecida por un administrador: hasta cambiarla, la API no deja hacer nada más.
  if (user?.mustChangePassword && pathname !== "/account/password")
    return <Redirect href="/account/password" />;
  return (
    <QueryClientProvider client={queryClient} key={contextKey}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SessionBanner />
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
          <Stack.Screen
            name="tool/new"
            options={{ title: "Nueva herramienta", presentation: "modal" }}
          />
          <Stack.Screen
            name="tool/edit"
            options={{ title: "Editar herramienta", presentation: "modal" }}
          />
          <Stack.Screen
            name="event/new"
            options={{ title: "Registrar evento", presentation: "modal" }}
          />
          <Stack.Screen
            name="damage/new"
            options={{ title: "Reportar daño", presentation: "modal" }}
          />
          <Stack.Screen name="rentals/index" options={{ title: "Herramientas rentadas" }} />
          <Stack.Screen name="rental/new" options={{ title: "Recibir herramienta rentada" }} />
          <Stack.Screen name="rental/[id]" options={{ title: "Alquiler" }} />
          <Stack.Screen name="rental/return" options={{ title: "Registrar devolución" }} />
          <Stack.Screen name="transfer/new" options={{ title: "Nuevo traslado" }} />
          <Stack.Screen name="transfer/[id]" options={{ title: "Traslado" }} />
          <Stack.Screen name="transfer/receive" options={{ title: "Confirmar llegada" }} />
          <Stack.Screen
            name="locations/new"
            options={{ title: "Nuevo proyecto", presentation: "modal" }}
          />
          <Stack.Screen name="users/index" options={{ title: "Usuarios" }} />
          <Stack.Screen name="users/edit" options={{ title: "Usuario", presentation: "modal" }} />
          <Stack.Screen
            name="scan"
            options={{
              title: "Escanear código",
              presentation: "fullScreenModal",
              headerShown: false,
            }}
          />
          <Stack.Screen name="report/detail" options={{ title: "Detalle" }} />
          <Stack.Screen name="platform/organization" options={{ title: "Organización" }} />
          <Stack.Screen name="platform/user" options={{ title: "Usuario" }} />
          <Stack.Screen name="account/password" options={{ title: "Cambiar contraseña" }} />
        </Stack>
      </View>
    </QueryClientProvider>
  );
}
