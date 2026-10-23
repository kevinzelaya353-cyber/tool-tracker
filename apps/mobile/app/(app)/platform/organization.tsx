import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { organizationCreateSchema, type OrganizationCreateInput, type OrganizationUpdateInput } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { useOrganization, useSaveOrganization } from "@/features/platform/api";
import { confirmAsync } from "@/lib/dialogs";
import { formatDateTime } from "@/lib/format";
import { space, useTheme } from "@/theme";

type Form = {
  name: string;
  legalName: string;
  taxId: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  currency: string;
  brandColor: string;
};
const EMPTY: Form = { name: "", legalName: "", taxId: "", contactEmail: "", contactPhone: "", address: "", currency: "HNL", brandColor: "" };

/** Alta (con su primer administrador) o edición de una organización. Solo SuperAdmin. */
export default function OrganizationScreen() {
  const { font, colors } = useTheme();
  const { selectOrg } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const org = useOrganization(id);
  const save = useSaveOrganization(id);
  const [form, setForm] = useState<Form>(EMPTY);
  const [withAdmin, setWithAdmin] = useState(true);
  const [admin, setAdmin] = useState({ name: "", username: "", email: "", password: "" });
  const [loaded, setLoaded] = useState(!id);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!org.data || loaded) return;
    const o = org.data;
    setForm({
      name: o.name,
      legalName: o.legalName ?? "",
      taxId: o.taxId ?? "",
      contactEmail: o.contactEmail ?? "",
      contactPhone: o.contactPhone ?? "",
      address: o.address ?? "",
      currency: o.currency,
      brandColor: o.brandColor ?? "",
    });
    setLoaded(true);
  }, [org.data, loaded]);

  if (!loaded) return org.isLoading ? <Loading /> : <Screen><ErrorBanner error={org.error} /></Screen>;

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  const createInput: OrganizationCreateInput = {
    name: form.name.trim(),
    legalName: opt(form.legalName),
    taxId: opt(form.taxId),
    contactEmail: opt(form.contactEmail),
    contactPhone: opt(form.contactPhone),
    address: opt(form.address),
    currency: form.currency.trim().toUpperCase() || "HNL",
    brandColor: opt(form.brandColor),
    admin: withAdmin && !id ? { name: admin.name.trim(), username: admin.username.trim(), email: opt(admin.email), password: admin.password } : undefined,
  };
  const check = organizationCreateSchema.safeParse(createInput);
  const errorOf = (path: string) =>
    touched && !check.success ? check.error.issues.find((i) => i.path.join(".") === path)?.message : undefined;

  const submit = () => {
    setTouched(true);
    if (!check.success) return;
    if (!id) {
      save.mutate(check.data, { onSuccess: (o) => router.replace({ pathname: "/platform/organization", params: { id: o.id } }) });
      return;
    }
    const nul = (v: string) => (v.trim() ? v.trim() : null);
    const update: OrganizationUpdateInput = {
      name: form.name.trim(),
      legalName: nul(form.legalName),
      taxId: nul(form.taxId),
      contactEmail: nul(form.contactEmail),
      contactPhone: nul(form.contactPhone),
      address: nul(form.address),
      currency: createInput.currency,
      brandColor: nul(form.brandColor),
    };
    save.mutate(update, { onSuccess: () => router.back() });
  };

  const toggleActive = async () => {
    if (!org.data) return;
    const deactivate = org.data.active;
    const ok = await confirmAsync(
      deactivate ? "Desactivar organización" : "Reactivar organización",
      deactivate
        ? `Nadie de ${org.data.name} podrá entrar y se cerrarán sus sesiones. Su información se conserva.`
        : `Los usuarios de ${org.data.name} podrán volver a entrar.`,
      { confirmText: deactivate ? "Desactivar" : "Reactivar", destructive: deactivate },
    );
    if (ok) save.mutate({ active: !deactivate });
  };

  return (
    <Screen footer={<Button title={id ? "Guardar cambios" : "Crear organización"} icon="checkmark" loading={save.isPending} onPress={submit} />}>
      <Stack.Screen options={{ title: id ? (org.data?.name ?? "Organización") : "Nueva organización" }} />
      <ErrorBanner error={save.error} />

      {org.data ? (
        <Card>
          <Text style={font.small}>
            {org.data.slug} · {org.data.users} usuario(s) · {org.data.tools} herramienta(s) · {org.data.active ? "Activa" : "Desactivada"}
          </Text>
          {org.data.admins?.length ? (
            <View style={styles.gap}>
              <Text style={font.label}>Administradores</Text>
              {org.data.admins.map((a) => (
                <Pressable key={a.id} onPress={() => router.push({ pathname: "/platform/user", params: { id: a.id } })}>
                  <Text style={[font.body, { color: colors.primaryDark }]}>
                    {a.name} (@{a.username}){!a.active ? " · inactivo" : a.lockedAt ? " · bloqueado" : ""}
                    {a.lastLoginAt ? ` · último ingreso ${formatDateTime(a.lastLoginAt)}` : " · nunca ha entrado"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={font.small}>Sin administrador: crea uno desde Usuarios.</Text>
          )}
          <View style={styles.row}>
            <Button
              title="Operar en esta organización"
              icon="enter-outline"
              compact
              disabled={!org.data.active}
              onPress={() => {
                selectOrg({ id: org.data!.id, name: org.data!.name, currency: org.data!.currency });
                router.navigate("/");
              }}
            />
            <Button
              title="Ver usuarios"
              icon="people-outline"
              variant="secondary"
              compact
              onPress={() => router.navigate({ pathname: "/platform-users", params: { organizationId: org.data!.id } })}
            />
          </View>
        </Card>
      ) : null}

      <TextField label="Nombre" value={form.name} onChangeText={set("name")} maxLength={120} error={errorOf("name")} autoFocus={!id} />
      <TextField label="Razón social (opcional)" value={form.legalName} onChangeText={set("legalName")} maxLength={160} />
      <TextField label="RTN / identificación fiscal (opcional)" value={form.taxId} onChangeText={set("taxId")} maxLength={40} />
      <TextField
        label="Correo de contacto (opcional)"
        value={form.contactEmail}
        onChangeText={set("contactEmail")}
        autoCapitalize="none"
        keyboardType="email-address"
        error={errorOf("contactEmail")}
      />
      <TextField label="Teléfono (opcional)" value={form.contactPhone} onChangeText={set("contactPhone")} keyboardType="phone-pad" maxLength={40} />
      <TextField label="Dirección (opcional)" value={form.address} onChangeText={set("address")} maxLength={250} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Moneda"
            value={form.currency}
            onChangeText={(v) => set("currency")(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={3}
            hint="Código ISO: HNL, USD, GTQ…"
            error={errorOf("currency")}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="Color de marca (opcional)"
            value={form.brandColor}
            onChangeText={set("brandColor")}
            autoCapitalize="none"
            placeholder="#F59E0B"
            maxLength={7}
            error={errorOf("brandColor")}
          />
        </View>
      </View>

      {!id ? (
        <Card>
          <View style={styles.row}>
            <Text style={[font.h2, styles.flex]}>Primer administrador</Text>
            <Switch value={withAdmin} onValueChange={setWithAdmin} />
          </View>
          {withAdmin ? (
            <>
              <TextField label="Nombre" value={admin.name} onChangeText={(v) => setAdmin((a) => ({ ...a, name: v }))} error={errorOf("admin.name")} />
              <TextField
                label="Usuario"
                value={admin.username}
                onChangeText={(v) => setAdmin((a) => ({ ...a, username: v.toLowerCase() }))}
                autoCapitalize="none"
                autoCorrect={false}
                error={errorOf("admin.username")}
              />
              <TextField
                label="Correo (opcional)"
                value={admin.email}
                onChangeText={(v) => setAdmin((a) => ({ ...a, email: v }))}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextField
                label="Contraseña temporal"
                value={admin.password}
                onChangeText={(v) => setAdmin((a) => ({ ...a, password: v }))}
                secureTextEntry
                autoCapitalize="none"
                error={errorOf("admin.password")}
                hint="Mínimo 10 caracteres con letras y números. Deberá cambiarla en su primer ingreso."
              />
            </>
          ) : (
            <Text style={font.small}>Podrás crearlo después desde Usuarios.</Text>
          )}
        </Card>
      ) : null}

      {org.data ? (
        <Button
          title={org.data.active ? "Desactivar organización" : "Reactivar organización"}
          icon={org.data.active ? "pause-circle-outline" : "play-circle-outline"}
          variant={org.data.active ? "danger" : "secondary"}
          onPress={toggleActive}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  flex: { flex: 1, minWidth: 140 },
  gap: { gap: space.xs },
});
