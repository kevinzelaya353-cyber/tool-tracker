import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate, formatDateTime } from "@/lib/format";
import { radius, space, makeStyles, useTheme } from "@/theme";

interface Props {
  label: string;
  value: Date;
  onChange(date: Date): void;
  mode?: "date" | "datetime";
  error?: string;
}

/** No permite fechas futuras (la API también las rechaza). */
export function DateTimeField({ label, value, onChange, mode = "datetime", error }: Props) {
  const styles = useStyles();
  const { colors, font, scheme } = useTheme();
  const [step, setStep] = useState<null | "date" | "time">(null);

  const handle = (e: DateTimePickerEvent, d?: Date) => {
    if (e.type === "dismissed" || !d) return setStep(null);
    if (Platform.OS === "android" && mode === "datetime" && step === "date") {
      // Android muestra fecha y hora en diálogos separados.
      onChange(d);
      return setStep("time");
    }
    onChange(d > new Date() ? new Date() : d);
    if (Platform.OS === "android") setStep(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={font.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable style={[styles.field, error ? styles.fieldError : null]} onPress={() => setStep("date")}>
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
          <Text style={font.body}>{mode === "date" ? formatDate(value.toISOString()) : formatDateTime(value)}</Text>
        </Pressable>
        <Pressable style={styles.now} onPress={() => onChange(new Date())}>
          <Text style={styles.nowText}>Ahora</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {step ? (
        <DateTimePicker
          value={value}
          mode={Platform.OS === "ios" ? mode : step}
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={new Date()}
          themeVariant={scheme}
          onChange={handle}
        />
      ) : null}
      {step && Platform.OS === "ios" ? (
        <Pressable onPress={() => setStep(null)} style={styles.done}>
          <Text style={styles.nowText}>Listo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.xs },
    row: { flexDirection: "row", gap: space.sm },
    field: {
      flex: 1,
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
    },
    fieldError: { borderColor: colors.danger },
    now: { justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
    nowText: { fontWeight: "700", color: colors.primaryDark },
    done: { alignSelf: "flex-end", padding: space.sm },
    error: { fontSize: 13, color: colors.danger },
  }),
);
