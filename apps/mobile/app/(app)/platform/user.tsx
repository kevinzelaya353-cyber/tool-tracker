import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { credentialSchemaFor, PASSWORD_ROLES, ROLE, usernameSchema, type Role } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  useCreatePlatformUser,
  useOrganizations,
  usePlatformUser,
  useResetPlatformPassword,
  useRevokePlatformSessions,
  useUpdatePlatformUser,
} from "@/features/platform/api";
import { confirmAsync, notify } from "@/lib/dialogs";
import { formatDateTime, ROLE_LABEL } from "@/lib/format";
import { space, useTheme } from "@/theme";

/** Con ?id= muestra el estado de la cuenta y sus acciones; sin id, da de alta un usuario. Solo SuperAdmin. */
export default function PlatformUserScreen() {
  const { id, organizationId } = useLocalSearchParams<{ id?: string; organizationId?: string }>();
  return id ? <AccountScreen id={id} /> : <CreateUser organizationId={organizationId || undefined} />;
}

function AccountScreen({ id }: { id: string }) {
  const { font, colors } = useTheme();
  const { user: me, startImpersonation } = useAuth();
  const account = usePlatformUser(id);
  const update = useUpdatePlatformUser(id);
  const reset = useResetPlatformPassword(id);
  const revoke = useRevokePlatformSessions(id);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [impersonating, setImpersonating] = useState(false);
  const [impError, setImpError] = useState<unknown>(null);

  if (account.isLoading) return <Loading />;
  const a = account.data;
  if (!a) return <Screen><ErrorBanner error={account.error} /></Screen>;

  const isSuper = a.role === "SUPERADMIN";
  const isSelf = a.id === me?.id;
  const hasAccess = Boolean(a.username || a.email);
  const credCheck = credentialSchemaFor(a.role).safeParse(password);
  const usesPassword = PASSWORD_ROLES.includes(a.role);

  const accessAs = async () => {
    setImpError(null);
    setImpersonating(true);
    try {
      await startImpersonation(a.id, reason.trim());
      router.navigate("/");
    } catch (e) {
      setImpError(e);
    } finally {
      setImpersonating(false);
    }
  };

  const toggleActive = async () => {
    const deactivate = a.active;
    const ok = await confirmAsync(
      deactivate ? "Desactivar cuenta" : "Reactivar cuenta",
      deactivate ? `${a.name} no podrá entrar y se cerrarán sus sesiones. Su historial se conserva.` : `${a.name} podrá volver a entrar.`,
      { confirmText: deactivate ? "Desactivar" : "Reactivar", destructive: deactivate },
    );
    if (!ok) return;
    update.mutate(isSuper ? { active: !deactivate, confirmPassword } : { active: !deactivate });
  };

  const doReset = () =>
    reset.mutate(
      { password, mustChangePassword: mustChange, ...(isSuper && { confirmPassword }) },
      {
        onSuccess: () => {
          setPassword("");
          void notify("Credencial restablecida", mustChange ? "Deberá cambiarla en su próximo ingreso. Sus sesiones abiertas se cerraron." : "Sus sesiones abiertas se cerraron.");
        },
      },
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: a.name }} />
      <ErrorBanner error={update.error ?? reset.error ?? revoke.error} />

      <Card>
        <Text style={font.title}>{a.name}</Text>
        <Text style={font.body}>{hasAccess ? `@${a.username ?? a.email}` : "Sin acceso a la app"}</Text>
        <Text style={[font.small, styles.bold]}>
          {ROLE_LABEL[a.role]} · {a.organization ? a.organization.name : "Plataforma (sin organización)"}
        </Text>
        <View style={styles.facts}>
          <Fact label="Estado" value={!a.active ? "Inactiva" : a.lockedAt ? `Bloqueada desde ${formatDateTime(a.lockedAt)}` : "Activa"} />
          <Fact label="Intentos fallidos seguidos" value={String(a.failedLogins ?? 0)} />
          <Fact label="Último ingreso" value={a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "Nunca"} />
          <Fact label="Sesiones abiertas" value={String(a.activeSessions)} />
          <Fact label="Credencial cambiada" value={a.passwordChangedAt ? formatDateTime(a.passwordChangedAt) : "—"} />
          <Fact label="Debe cambiarla al entrar" value={a.mustChangePassword ? "Sí" : "No"} />
        </View>
        <Text style={font.small}>La contraseña o el PIN nunca se pueden consultar: solo restablecer.</Text>
      </Card>

      {!isSuper && hasAccess && a.active ? (
        <Card>
          <Text style={font.h2}>Acceder como este usuario</Text>
          <Text style={font.small}>
            Sesión de soporte de 30 minutos con SUS permisos y solo SU organización. No usa ni cambia su contraseña; todo lo que hagas
            queda auditado a tu nombre. No podrás gestionar cuentas ni credenciales durante la sesión.
          </Text>
          <TextField label="Motivo" value={reason} onChangeText={setReason} placeholder="Ej.: revisar un traslado que no cuadra" maxLength={300} />
          <ErrorBanner error={impError} />
          <Button title="Acceder como usuario" icon="log-in-outline" loading={impersonating} disabled={reason.trim().length < 5} onPress={accessAs} />
        </Card>
      ) : null}

      {hasAccess && !isSelf ? (
        <Card>
          <Text style={font.h2}>Restablecer {usesPassword ? "contraseña" : "PIN"}</Text>
          <TextField
            label={usesPassword ? "Contraseña nueva" : "PIN nuevo (4 dígitos)"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            keyboardType={usesPassword ? "default" : "number-pad"}
            maxLength={usesPassword ? 128 : 4}
            error={password && !credCheck.success ? credCheck.error.issues[0]?.message : undefined}
          />
          <View style={styles.row}>
            <Text style={[font.body, styles.flex]}>Debe cambiarla en su próximo ingreso</Text>
            <Switch value={mustChange} onValueChange={setMustChange} />
          </View>
          <Button title="Restablecer" icon="key-outline" loading={reset.isPending} disabled={!credCheck.success || (isSuper && !confirmPassword)} onPress={doReset} />
        </Card>
      ) : null}

      {isSuper && !isSelf ? (
        <TextField
          label="Tu contraseña (confirmación)"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          hint="Las operaciones sobre otra cuenta SuperAdmin exigen confirmar con tu propia contraseña."
        />
      ) : null}

      <View style={styles.actions}>
        {!isSuper ? (
          a.lockedAt ? (
            <Button title="Desbloquear" icon="lock-open-outline" variant="secondary" compact onPress={() => update.mutate({ unlock: true })} />
          ) : (
            <Button title="Bloquear" icon="lock-closed-outline" variant="secondary" compact disabled={!hasAccess} onPress={() => update.mutate({ lock: true })} />
          )
        ) : null}
        {!isSuper && hasAccess ? (
          <Button
            title={a.mustChangePassword ? "No exigir cambio de clave" : "Exigir cambio de clave"}
            icon="refresh-outline"
            variant="secondary"
            compact
            onPress={() => update.mutate({ mustChangePassword: !a.mustChangePassword })}
          />
        ) : null}
        <Button
          title={`Cerrar sesiones (${a.activeSessions})`}
          icon="exit-outline"
          variant="secondary"
          compact
          disabled={a.activeSessions === 0}
          onPress={() => revoke.mutate()}
        />
      </View>

      {!isSelf ? (
        <Button
          title={a.active ? "Desactivar cuenta" : "Reactivar cuenta"}
          icon={a.active ? "person-remove-outline" : "person-add-outline"}
          variant={a.active ? "danger" : "secondary"}
          disabled={isSuper && !confirmPassword}
          onPress={toggleActive}
        />
      ) : null}
      {a.organization ? (
        <Text style={[font.small, { color: colors.textMuted }]}>
          Nombre, rol y vehículo se editan con las reglas de su organización: entra a operar en {a.organization.name} y usa Perfil › Usuarios.
        </Text>
      ) : null}
    </Screen>
  );
}

function CreateUser({ organizationId: initialOrg }: { organizationId?: string }) {
  const { font } = useTheme();
  const orgs = useOrganizations();
  const create = useCreatePlatformUser();
  const [organizationId, setOrganizationId] = useState<string | undefined>(initialOrg);
  const [role, setRole] = useState<Role>("ADMIN");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isSuper = role === "SUPERADMIN";
  const usesPassword = PASSWORD_ROLES.includes(role);
  const userCheck = usernameSchema.safeParse(username);
  const credCheck = credentialSchemaFor(role).safeParse(password);
  const valid = Boolean(name.trim()) && userCheck.success && credCheck.success && (isSuper ? Boolean(confirmPassword) : Boolean(organizationId));

  const submit = () =>
    create.mutate(
      {
        organizationId: isSuper ? undefined : organizationId,
        name: name.trim(),
        username: userCheck.data!,
        email: email.trim() || undefined,
        password,
        role,
        ...(isSuper && { confirmPassword }),
      },
      { onSuccess: (u) => router.replace({ pathname: "/platform/user", params: { id: u.id } }) },
    );

  return (
    <Screen footer={<Button title="Crear usuario" icon="checkmark" loading={create.isPending} disabled={!valid} onPress={submit} />}>
      <Stack.Screen options={{ title: "Nuevo usuario" }} />
      <ErrorBanner error={create.error} />
      <View style={styles.gap}>
        <Text style={font.label}>Rol</Text>
        <View style={styles.row}>
          {ROLE.map((r) => (
            <Chip key={r} label={ROLE_LABEL[r]} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </View>
        {isSuper ? (
          <Text style={font.small}>
            Acceso total a todas las organizaciones. No pertenece a ninguna. Deberá cambiar la contraseña al entrar.
          </Text>
        ) : null}
      </View>
      {!isSuper ? (
        <SelectField
          label="Organización"
          value={organizationId}
          onChange={setOrganizationId}
          options={(orgs.data ?? []).filter((o) => o.active).map((o) => ({ value: o.id, label: o.name }))}
        />
      ) : null}
      <TextField label="Nombre completo" value={name} onChangeText={setName} maxLength={120} />
      <TextField
        label="Usuario"
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={30}
        error={username && !userCheck.success ? userCheck.error.issues[0]?.message : undefined}
      />
      <TextField label="Correo (opcional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextField
        label={usesPassword ? "Contraseña" : "PIN de 4 dígitos"}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        keyboardType={usesPassword ? "default" : "number-pad"}
        maxLength={usesPassword ? 128 : 4}
        error={password && !credCheck.success ? credCheck.error.issues[0]?.message : undefined}
      />
      {isSuper ? (
        <TextField
          label="Tu contraseña (confirmación)"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          hint="Crear un SuperAdmin es una operación crítica: confirma con tu propia contraseña."
        />
      ) : null}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { font } = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={font.small}>{label}</Text>
      <Text style={[font.body, styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: "700" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fact: { minWidth: 150, flexGrow: 1, gap: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  gap: { gap: space.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
