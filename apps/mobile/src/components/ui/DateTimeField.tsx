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
  /** Para fechas previstas (p. ej. devolución de un alquiler). Por defecto no se permiten futuras. */
  allowFuture?: boolean;
}

/** No permite fechas futuras salvo con `allowFuture` (la API también las rechaza). */
export function DateTimeField({ label, value, onChange, mode = "datetime", error, allowFuture = false }: Props) {
  const styles = useStyles();
  const { colors, font, scheme } = useTheme();
  const [step, setStep] = useState<null | "date" | "time">(null);
  const clamp = (d: Date) => (!allowFuture && d > new Date() ? new Date() : d);

  const handle = (e: DateTimePickerEvent, d?: Date) => {
    if (e.type === "dismissed" || !d) return setStep(null);
    if (Platform.OS === "android" && mode === "datetime" && step === "date") {
      // Android muestra fecha y hora en diálogos separados.
      onChange(d);
      return setStep("time");
    }
    onChange(clamp(d));
    if (Platform.OS === "android") setStep(null);
  };

  // El selector nativo no tiene implementación web: ahí se usa el de navegador.
  if (Platform.OS === "web") {
    const type = mode === "date" ? "date" : "datetime-local";
    const onInput = (e: { target: { value: string } }) => {
      const d = fromInputValue(e.target.value);
      if (d) onChange(clamp(d));
    };
    return (
      <View style={styles.wrap}>
        <Text style={font.label}>{label}</Text>
        <View style={styles.row}>
          <View style={[styles.field, error ? styles.fieldError : null]}>
            <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            <input
              type={type}
              value={toInputValue(value, mode)}
              max={allowFuture ? undefined : toInputValue(new Date(), mode)}
              onChange={onInput}
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: colors.text,
                fontSize: 15,
                fontFamily: "inherit",
                colorScheme: scheme,
              }}
            />
          </View>
          <Pressable style={styles.now} onPress={() => onChange(new Date())}>
            <Text style={styles.nowText}>Ahora</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

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
          maximumDate={allowFuture ? undefined : new Date()}
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

const pad = (n: number) => String(n).padStart(2, "0");

/** Valor de <input type="date|datetime-local"> en hora local. */
function toInputValue(d: Date, mode: "date" | "datetime") {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return mode === "date" ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Se arma con componentes: new Date("YYYY-MM-DD") se interpretaría en UTC y correría un día. */
function fromInputValue(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  if (!m) return null;
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0));
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
