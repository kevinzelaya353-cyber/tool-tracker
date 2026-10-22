import { StyleSheet, Text, View } from "react-native";
import { space, useTheme } from "@/theme";
import { Chip } from "./Chip";

interface Props<T extends string> {
  label: string;
  value?: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange(value: T): void;
  error?: string;
}

/** Elección única entre pocas opciones, a la vista y con un toque (cómodo en campo, con guantes). */
export function ChoiceChips<T extends string>({ label, value, options, labels, onChange, error }: Props<T>) {
  const { font, colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={font.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((o) => (
          <Chip key={o} label={labels[o]} selected={value === o} onPress={() => onChange(o)} />
        ))}
      </View>
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
