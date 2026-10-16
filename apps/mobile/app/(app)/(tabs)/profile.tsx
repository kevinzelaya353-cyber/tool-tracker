import { StyleSheet, Text, View } from "react-native";
import { confirmAsync } from "@/lib/dialogs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/features/auth/AuthProvider";
import { useThemePreference, type ThemePreference } from "@/features/theme/ThemeProvider";
import { space, useTheme } from "@/theme";

const ROLE_LABEL = { ADMIN: "Administrador", BODEGUERO: "Bodeguero", SUPERVISOR: "Supervisor de proyecto", LECTOR: "Solo lectura" };

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

export default function ProfileScreen() {
  const { font } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <Screen>
      <Card>
        <Text style={font.title}>{user.name}</Text>
        <Text style={font.body}>{user.email}</Text>
        <Text style={[font.small, styles.role]}>{ROLE_LABEL[user.role]}</Text>
      </Card>
      <Card>
        <Text style={font.h2}>Apariencia</Text>
        <View style={styles.options}>
          {THEME_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={preference === o.value} onPress={() => setPreference(o.value)} />
          ))}
        </View>
        <Text style={font.small}>"Sistema" sigue el modo claro u oscuro del teléfono.</Text>
      </Card>
      <Button
        title="Cerrar sesión"
        icon="log-out-outline"
        variant="secondary"
        onPress={async () => {
          if (await confirmAsync("Cerrar sesión", "¿Seguro que quieres salir?", { confirmText: "Salir", destructive: true })) {
            await logout();
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  role: { fontWeight: "700" },
  options: { flexDirection: "row", gap: space.sm },
});
