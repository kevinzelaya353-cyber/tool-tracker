import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
}

/** Selector en modal a pantalla completa con búsqueda: cómodo con una mano y listas largas. */
export function SelectField({ label, value, options, onChange, placeholder = "Seleccionar…", error, disabled }: Props) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? options.filter((o) => `${o.label} ${o.description ?? ""}`.toLowerCase().includes(needle))
      : options;
  }, [options, q]);

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

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={font.h2}>{label}</Text>
            <Pressable accessibilityLabel="Cerrar" onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          {options.length > 7 ? (
            <TextInput
              placeholder="Buscar…"
              placeholderTextColor={colors.textMuted}
              value={q}
              onChangeText={setQ}
              style={styles.search}
              autoFocus
            />
          ) : null}
          <FlatList
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
                  setOpen(false);
                  setQ("");
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{item.label}</Text>
                  {item.description ? <Text style={font.small}>{item.description}</Text> : null}
                </View>
                {item.value === value ? <Ionicons name="checkmark" size={20} color={colors.primaryDark} /> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
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
  }),
);
