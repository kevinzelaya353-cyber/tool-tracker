import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, makeStyles, useTheme } from "@/theme";

interface Props {
  label: string;
  value: string;
  caption?: string;
  /** Abre el detalle de los registros que forman la cifra. */
  onPress?: () => void;
}

/** Cifra destacada: para un único total no hace falta un gráfico. */
export function StatTile({ label, value, caption, onPress }: Props) {
  const styles = useStyles();
  const { font } = useTheme();
  const a11y = `${label}: ${value}${caption ? `, ${caption}` : ""}`;
  const body = (
    <>
      <Text style={font.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {caption ? <Text style={font.small}>{caption}</Text> : null}
      {onPress ? <Text style={styles.more}>Ver detalle ›</Text> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.tile} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}. Ver detalle`}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    tile: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    value: { fontSize: 22, fontWeight: "800", color: colors.text },
    more: { fontSize: 12, fontWeight: "700", color: colors.primaryDark, marginTop: 2 },
    pressed: { opacity: 0.8 },
  }),
);
