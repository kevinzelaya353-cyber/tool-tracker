import { StyleSheet, Text, View } from "react-native";
import { radius, space, makeStyles, useTheme } from "@/theme";

interface Props {
  label: string;
  value: string;
  caption?: string;
}

/** Cifra destacada: para un único total no hace falta un gráfico. */
export function StatTile({ label, value, caption }: Props) {
  const styles = useStyles();
  const { font } = useTheme();
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ""}`}>
      <Text style={font.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {caption ? <Text style={font.small}>{caption}</Text> : null}
    </View>
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
  }),
);
