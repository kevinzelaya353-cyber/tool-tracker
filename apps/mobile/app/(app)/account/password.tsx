import { router, Stack } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { credentialSchemaFor, PASSWORD_ROLES } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBanner } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/theme";

/**
 * Cambio de la propia credencial. Si un administrador la restableció, es obligatorio: la app no
 * deja salir de aquí (y la API rechaza todo lo demás) hasta cambiarla. Cierra las demás sesiones.
 */
export default function ChangePasswordScreen() {
  const { font } = useTheme();
  const { user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!user) return null;

  const usesPassword = PASSWORD_ROLES.includes(user.role);
  const forced = user.mustChangePassword;
  const check = credentialSchemaFor(user.role).safeParse(next);
  const mismatch = repeat.length > 0 && repeat !== next;
  const valid = Boolean(current) && check.success && repeat === next && next !== current;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Guardar" icon="checkmark" loading={saving} disabled={!valid} onPress={submit} />}>
      <Stack.Screen options={{ title: usesPassword ? "Cambiar contraseña" : "Cambiar PIN", headerBackVisible: !forced, gestureEnabled: !forced }} />
      {forced ? (
        <Card>
          <Text style={font.h2}>Debes cambiar tu {usesPassword ? "contraseña" : "PIN"}</Text>
          <Text style={font.small}>
            Un administrador la restableció. Elige una nueva que solo tú conozcas para seguir usando la app.
          </Text>
        </Card>
      ) : null}
      <ErrorBanner error={error} />
      <TextField
        label={usesPassword ? "Contraseña actual" : "PIN actual"}
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoCapitalize="none"
        keyboardType={usesPassword ? "default" : "number-pad"}
        autoFocus
      />
      <TextField
        label={usesPassword ? "Nueva contraseña" : "Nuevo PIN (4 dígitos)"}
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoCapitalize="none"
        keyboardType={usesPassword ? "default" : "number-pad"}
        maxLength={usesPassword ? 128 : 4}
        error={next && !check.success ? check.error.issues[0]?.message : next && next === current ? "Debe ser distinta de la actual" : undefined}
        hint={usesPassword ? "Mínimo 10 caracteres, con letras y números." : "Evita 1234, 0000 o fechas obvias."}
      />
      <TextField
        label="Repítela"
        value={repeat}
        onChangeText={setRepeat}
        secureTextEntry
        autoCapitalize="none"
        keyboardType={usesPassword ? "default" : "number-pad"}
        maxLength={usesPassword ? 128 : 4}
        error={mismatch ? "No coincide" : undefined}
      />
      {forced ? <Button title="Cerrar sesión" icon="log-out-outline" variant="ghost" onPress={logout} /> : null}
    </Screen>
  );
}
