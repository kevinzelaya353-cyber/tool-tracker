import { Pressable, StyleSheet, Text } from "react-native";
import { radius, space, makeStyles } from "@/theme";

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected, onPress }: Props) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    chip: {
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    selected: { backgroundColor: colors.text, borderColor: colors.text },
    text: { fontSize: 13, fontWeight: "600", color: colors.text },
    textSelected: { color: colors.surface },
  }),
);
