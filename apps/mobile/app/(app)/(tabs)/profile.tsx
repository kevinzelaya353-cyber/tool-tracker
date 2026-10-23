import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { confirmAsync } from "@/lib/dialogs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { SelectField } from "@/components/ui/SelectField";
import { useAuth } from "@/features/auth/AuthProvider";
import { useOrganizations } from "@/features/platform/api";
import { useThemePreference, type ThemePreference } from "@/features/theme/ThemeProvider";
import { ROLE_LABEL } from "@/lib/format";
import { space, useTheme } from "@/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];
const PLATFORM = "__platform__";

export default function ProfileScreen() {
  const { font } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { user, logout, can, isSuperadmin, org, selectOrg, supportActor } = useAuth();
  const orgs = useOrganizations(isSuperadmin);
  if (!user) return null;

  return (
    <Screen>
      <Card>
        <Text style={font.title}>{user.name}</Text>
        <Text style={font.body}>{user.username ?? user.email}</Text>
        <Text style={[font.small, styles.role]}>{ROLE_LABEL[user.role]}</Text>
        <Text style={font.small}>{user.organization ? `Organización: ${user.organization.name}` : "Plataforma: sin organización"}</Text>
      </Card>

      {isSuperadmin ? (
        <Card>
          <Text style={font.h2}>Organización en la que operas</Text>
          <SelectField
            label="Contexto"
            value={org?.id ?? PLATFORM}
            onChange={(v) => {
              const o = orgs.data?.find((x) => x.id === v);
              selectOrg(o ? { id: o.id, name: o.name, currency: o.currency } : null);
              router.navigate("/");
            }}
            options={[
              { value: PLATFORM, label: "Plataforma (todas)", description: "Tablero global, organizaciones, usuarios y auditoría" },
              ...(orgs.data ?? []).filter((o) => o.active).map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
          <Text style={font.small}>
            Elegir una organización no te asigna a ella: solo indica dónde registrar y consultar. Cada acción queda auditada con esa
            organización.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text style={font.h2}>Apariencia</Text>
        <View style={styles.options}>
          {THEME_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={preference === o.value} onPress={() => setPreference(o.value)} />
          ))}
        </View>
        <Text style={font.small}>"Sistema" sigue el modo claro u oscuro del teléfono.</Text>
      </Card>
      {can("users:manage") && (user.organization || org) ? (
        <Button title="Usuarios" icon="people-outline" variant="secondary" onPress={() => router.push("/users")} />
      ) : null}
      {can("audit:read") && (user.organization || org) ? (
        <Button title="Auditoría de la organización" icon="document-text-outline" variant="secondary" onPress={() => router.push("/audit")} />
      ) : null}
      {!supportActor ? (
        <Button
          title={user.role === "SUPERADMIN" || user.role === "ADMIN" ? "Cambiar contraseña" : "Cambiar PIN"}
          icon="key-outline"
          variant="secondary"
          onPress={() => router.push("/account/password")}
        />
      ) : null}
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
