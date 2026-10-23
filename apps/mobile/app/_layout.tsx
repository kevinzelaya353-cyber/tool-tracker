import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { Loading } from "@/components/ui/Feedback";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { installCrashRecorder, takeLastCrash } from "@/lib/crashLog";
import { notify } from "@/lib/dialogs";
import { createQueryClient } from "@/lib/queryClient";
import { useTheme } from "@/theme";

installCrashRecorder();

/** Último recurso: un error al dibujar cualquier pantalla muestra esto en vez de cerrar la app. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorScreen {...props} />;
}

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
  // Si la sesión anterior terminó por un error fatal, se muestra una vez para poder reportarlo.
  useEffect(() => {
    const crash = takeLastCrash();
    if (crash?.fatal) {
      void notify(
        "La app se cerró inesperadamente",
        `La última vez se cerró por este error. Si se repite, envíalo a soporte:

${crash.message}
(${crash.at}, ${crash.version})`,
      );
    }
  }, []);

  // Caché de la sesión (inicio de sesión, /me). Los datos de cada organización usan la suya: (app)/_layout.
  const [queryClient] = useState(createQueryClient);

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
