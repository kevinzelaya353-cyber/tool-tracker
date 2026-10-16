import { StyleSheet, Text, View } from "react-native";
import { space, makeStyles } from "@/theme";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} accessibilityLabel={`Paso ${current + 1} de ${steps.length}: ${steps[current]}`}>
      <View style={styles.bars}>
        {steps.map((s, i) => (
          <View key={s} style={[styles.bar, i <= current && styles.barActive]} />
        ))}
      </View>
      <Text style={styles.label}>
        Paso {current + 1} de {steps.length} · <Text style={styles.strong}>{steps[current]}</Text>
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    bars: { flexDirection: "row", gap: space.xs },
    bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
    barActive: { backgroundColor: colors.primary },
    label: { fontSize: 13, color: colors.textMuted },
    strong: { fontWeight: "700", color: colors.text },
  }),
);
