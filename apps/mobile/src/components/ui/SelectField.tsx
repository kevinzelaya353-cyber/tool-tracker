import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "./Button";
import { ErrorBanner } from "./Feedback";
import { ModalSafeArea } from "./ModalSafeArea";
import { radius, space, makeStyles, useTheme } from "@/theme";

export interface Option {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  label: string;
  value?: string;
  options: Option[];
  onChange(value: string): void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Permite escribir un valor que no está en la lista y registrarlo en el momento. */
  create?: CreateOption;
}

export interface CreateOption {
  /** Qué se agrega, en minúscula: "proyecto", "vehículo"… */
  noun: string;
  /** Si se indica, se pide un segundo dato opcional (p. ej. "Dirección o ubicación"). */
  detailLabel?: string;
  /** Registra el valor y devuelve su id para seleccionarlo. */
  onCreate(name: string, detail?: string): Promise<string>;
}

/** Selector en modal a pantalla completa con búsqueda: cómodo con una mano y listas largas. */
export function SelectField({ label, value, options, onChange, placeholder = "Seleccionar…", error, disabled, create }: Props) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<{ name: string; detail: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? options.filter((o) => `${o.label} ${o.description ?? ""}`.toLowerCase().includes(needle))
      : options;
  }, [options, q]);
  const typed = q.trim();
  const exists = options.some((o) => o.label.trim().toLowerCase() === typed.toLowerCase());

  const close = () => {
    setOpen(false);
    setQ("");
    setDraft(null);
    setCreateError(null);
  };

  const save = async (name: string, detail?: string) => {
    if (!create || !name.trim()) return;
    setSaving(true);
    setCreateError(null);
    try {
      const id = await create.onCreate(name.trim(), detail?.trim() || undefined);
      onChange(id);
      close();
    } catch (e) {
      setCreateError(e);
    } finally {
      setSaving(false);
    }
  };

  // Con dato adicional se abre el mini-formulario; si no, se registra directamente lo escrito.
  const startCreate = (name: string) => (create?.detailLabel ? setDraft({ name, detail: "" }) : void save(name));

  return (
    <View style={styles.wrap}>
      <Text style={font.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, error ? styles.fieldError : null, disabled && styles.disabled]}
      >
        <Text style={[font.body, !selected && { color: colors.textMuted }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <ModalSafeArea style={styles.modal}>
          <View style={styles.header}>
            <Text style={font.h2}>{label}</Text>
            <Pressable accessibilityLabel="Cerrar" onPress={close} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          {draft && create ? (
            <View style={styles.form}>
              <Text style={font.h2}>Nuevo {create.noun}</Text>
              <ErrorBanner error={createError} />
              <TextInput
                placeholder="Nombre"
                placeholderTextColor={colors.textMuted}
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                style={styles.input}
                autoFocus
              />
              <TextInput
                placeholder={create.detailLabel}
                placeholderTextColor={colors.textMuted}
                value={draft.detail}
                onChangeText={(detail) => setDraft({ ...draft, detail })}
                style={styles.input}
              />
              <Button title="Guardar" icon="checkmark" loading={saving} disabled={!draft.name.trim()} onPress={() => save(draft.name, draft.detail)} />
              <Button title="Cancelar" variant="ghost" onPress={() => setDraft(null)} />
            </View>
          ) : null}
          {!draft && (options.length > 7 || create) ? (
            <TextInput
              placeholder={create ? `Buscar o escribir nuevo ${create.noun}…` : "Buscar…"}
              placeholderTextColor={colors.textMuted}
              value={q}
              onChangeText={setQ}
              style={styles.search}
              autoFocus
            />
          ) : null}
          {!draft && create ? (
            <>
              <Pressable style={styles.option} onPress={() => startCreate(typed && !exists ? typed : "")} disabled={saving}>
                <Ionicons name="add-circle-outline" size={22} color={colors.primaryDark} />
                <Text style={[font.body, styles.addText]} numberOfLines={1}>
                  {typed && !exists ? `Agregar "${typed}"` : `Agregar nuevo ${create.noun}`}
                </Text>
                {saving ? <ActivityIndicator color={colors.primary} /> : null}
              </Pressable>
              {!create.detailLabel ? <ErrorBanner error={createError} /> : null}
              <View style={styles.sep} />
            </>
          ) : null}
          {draft ? null : <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={<Text style={[font.small, styles.empty]}>Sin resultados</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.option}
                onPress={() => {
                  onChange(item.value);
                  close();
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{item.label}</Text>
                  {item.description ? <Text style={font.small}>{item.description}</Text> : null}
                </View>
                {item.value === value ? <Ionicons name="checkmark" size={20} color={colors.primaryDark} /> : null}
              </Pressable>
            )}
          />}
        </ModalSafeArea>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.xs },
    field: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.sm,
    },
    fieldError: { borderColor: colors.danger },
    disabled: { opacity: 0.5 },
    error: { fontSize: 13, color: colors.danger },
    modal: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.lg },
    search: {
      marginHorizontal: space.lg,
      marginBottom: space.sm,
      minHeight: 44,
      borderRadius: radius.md,
      backgroundColor: colors.neutralSoft,
      paddingHorizontal: space.md,
      fontSize: 15,
      color: colors.text,
    },
    option: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.lg },
    empty: { textAlign: "center", padding: space.xl },
    addText: { flex: 1, fontWeight: "700", color: colors.primaryDark },
    form: { paddingHorizontal: space.lg, gap: space.md },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      backgroundColor: colors.surface,
      fontSize: 15,
      color: colors.text,
    },
  }),
);
