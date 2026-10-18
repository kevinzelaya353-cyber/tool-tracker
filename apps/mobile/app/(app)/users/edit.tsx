import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { credentialSchemaFor, ROLE, usernameSchema, type Role, type UserUpdateInput } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { useVehicles } from "@/features/catalog/api";
import { useCreateUser, useManagedUsers, useUpdateUser } from "@/features/users/api";
import { confirmAsync } from "@/lib/dialogs";
import { formatDateTime, ROLE_LABEL } from "@/lib/format";
import { space, useTheme } from "@/theme";

const NO_VEHICLE = "__none__";

const ROLE_HINT: Record<Role, string> = {
  ADMIN: "Todo: usuarios, catálogos, reportes y exportar el Excel.",
  BODEGUERO: "Registra herramientas, traslados, eventos y proyectos.",
  SUPERVISOR: "Registra traslados y eventos en obra.",
  CHOFER: "Lleva herramientas: registra salidas y entrega con el PIN de quien recibe.",
  LECTOR: "Solo consulta.",
};

/** Alta de un usuario con usuario + PIN (contraseña completa si es administrador); con ?id= lo edita. */
export default function EditUserScreen() {
  const { font, colors } = useTheme();
  const { user: me } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const users = useManagedUsers();
  const existing = id ? users.data?.find((u) => u.id === id) : undefined;
  const vehicles = useVehicles();
  const create = useCreateUser();
  const update = useUpdateUser(id ?? "");
  const mutation = id ? update : create;

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("SUPERVISOR");
  const [password, setPassword] = useState("");
  const [vehicleId, setVehicleId] = useState<string>(NO_VEHICLE);
  const [touched, setTouched] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!existing || loaded) return;
    setName(existing.name);
    setUsername(existing.username ?? "");
    setRole(existing.role);
    setVehicleId(existing.defaultVehicleId ?? NO_VEHICLE);
    setLoaded(true);
  }, [existing, loaded]);

  if (!loaded) return users.isLoading ? <Loading /> : <Screen><ErrorBanner error={users.error} /></Screen>;

  const isSelf = existing?.id === me?.id;
  const isAdmin = role === "ADMIN";
  const hadAccess = Boolean(existing?.username || existing?.email);
  // Persona registrada solo como "entregó/recibió": recibe acceso al asignarle usuario y PIN.
  const givingAccess = Boolean(existing && !hadAccess && (username || password));
  const usernameRequired = !existing || hadAccess || givingAccess;
  // Credencial obligatoria al crear, al dar acceso o al cruzar la frontera de administrador.
  const needsCredential = !existing || givingAccess || (hadAccess && (existing.role === "ADMIN") !== isAdmin);
  const userCheck = usernameSchema.safeParse(username);
  const credCheck = credentialSchemaFor(role).safeParse(password);
  const userError =
    usernameRequired && (username || touched) ? (userCheck.success ? undefined : userCheck.error.issues[0]?.message) : undefined;
  const credError =
    password || (touched && needsCredential) ? (credCheck.success ? undefined : credCheck.error.issues[0]?.message) : undefined;
  const valid =
    Boolean(name.trim()) && (userCheck.success || !usernameRequired) && (credCheck.success || (!password && !needsCredential));

  const vehicleOrNull = vehicleId === NO_VEHICLE ? null : vehicleId;
  const done = () => (router.canGoBack() ? router.back() : router.replace("/users"));

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    if (!existing) {
      create.mutate(
        { name: name.trim(), username: userCheck.data!, password, role, defaultVehicleId: vehicleOrNull },
        { onSuccess: done },
      );
      return;
    }
    const changes: UserUpdateInput = {};
    if (name.trim() !== existing.name) changes.name = name.trim();
    if (userCheck.success && userCheck.data !== existing.username) changes.username = userCheck.data;
    if (role !== existing.role) changes.role = role;
    if (password) changes.password = password;
    if (vehicleOrNull !== existing.defaultVehicleId) changes.defaultVehicleId = vehicleOrNull;
    if (Object.keys(changes).length === 0) return done();
    update.mutate(changes, { onSuccess: done });
  };

  const toggleActive = async () => {
    if (!existing) return;
    const deactivate = existing.active;
    const ok = await confirmAsync(
      deactivate ? "Desactivar cuenta" : "Reactivar cuenta",
      deactivate
        ? `${existing.name} no podrá entrar a la app. Su historial se conserva.`
        : `${existing.name} podrá volver a entrar con su PIN.`,
      { confirmText: deactivate ? "Desactivar" : "Reactivar", destructive: deactivate },
    );
    if (ok) update.mutate({ active: !deactivate }, { onSuccess: done });
  };

  return (
    <Screen
      footer={
        <Button
          title={existing ? "Guardar cambios" : "Registrar usuario"}
          icon="checkmark"
          loading={mutation.isPending}
          disabled={touched && !valid}
          onPress={submit}
        />
      }
    >
      <Stack.Screen options={{ title: existing ? existing.name : "Nuevo usuario" }} />
      <ErrorBanner error={mutation.error} />

      {existing?.lockedAt ? (
        <Card style={{ backgroundColor: colors.dangerSoft }}>
          <Text style={[font.body, styles.bold]}>Cuenta bloqueada</Text>
          <Text style={font.small}>
            Se bloqueó el {formatDateTime(existing.lockedAt)} por varios PIN incorrectos seguidos. Si fue la misma persona,
            desbloquéala; si no, asígnale un PIN nuevo (también la desbloquea).
          </Text>
          <Button title="Desbloquear" icon="lock-open-outline" compact onPress={() => update.mutate({ unlock: true }, { onSuccess: done })} />
        </Card>
      ) : null}

      <TextField label="Nombre completo" value={name} onChangeText={setName} maxLength={120} placeholder="Mario López" autoFocus={!id} />
      <TextField
        label="Usuario"
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={30}
        placeholder="mario"
        error={userError}
        hint={
          existing && !hadAccess
            ? "Hoy no tiene acceso a la app. Asígnale usuario y PIN para que pueda entrar."
            : "Con esto inicia sesión. Sin espacios ni tildes."
        }
      />

      <View style={styles.roles}>
        <Text style={font.label}>Rol</Text>
        <View style={styles.row}>
          {ROLE.map((r) => (
            <Chip key={r} label={ROLE_LABEL[r]} selected={role === r} onPress={isSelf ? undefined : () => setRole(r)} />
          ))}
        </View>
        <Text style={font.small}>{isSelf ? "No puedes cambiar tu propio rol." : ROLE_HINT[role]}</Text>
      </View>

      <TextField
        label={isAdmin ? (existing && !needsCredential ? "Nueva contraseña (opcional)" : "Contraseña") : existing && !needsCredential ? "Nuevo PIN (opcional)" : "PIN de 4 dígitos"}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={isAdmin ? "default" : "number-pad"}
        maxLength={isAdmin ? 128 : 4}
        error={credError}
        hint={
          isAdmin
            ? "Mínimo 10 caracteres, con letras y números."
            : existing && !needsCredential
              ? "Déjalo vacío para no cambiarlo. Uno nuevo cierra sus sesiones abiertas."
              : "Evita 1234, 0000 o fechas obvias. Compártelo solo con esta persona."
        }
      />

      {role === "CHOFER" ? (
        <SelectField
          label="Vehículo habitual"
          value={vehicleId}
          onChange={setVehicleId}
          options={[
            { value: NO_VEHICLE, label: "Ninguno" },
            ...(vehicles.data ?? []).map((v) => ({ value: v.id, label: v.plate, description: v.description ?? undefined })),
          ]}
        />
      ) : null}

      {existing && !isSelf ? (
        <Button
          title={existing.active ? "Desactivar cuenta" : "Reactivar cuenta"}
          icon={existing.active ? "person-remove-outline" : "person-add-outline"}
          variant={existing.active ? "danger" : "secondary"}
          onPress={toggleActive}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  roles: { gap: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  bold: { fontWeight: "700" },
});
