import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/ui/Feedback";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/theme";

/** Pasa los colores del tema a la navegación (fondos de pantalla y transiciones) y a la barra de estado. */
function ThemedNavigation({ children }: { children: ReactNode }) {
  const { scheme, colors } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = useMemo(
    () => ({
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primaryDark,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    }),
    [base, colors],
  );
  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {children}
    </NavigationThemeProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  const signedIn = status === "signedIn";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // No reintentar errores de negocio/permiso; sí fallos de red o del servidor.
            retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemedNavigation>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ThemedNavigation>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
