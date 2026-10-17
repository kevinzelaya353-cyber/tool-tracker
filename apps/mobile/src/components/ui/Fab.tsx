import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet } from "react-native";
import { makeStyles, space, useTheme } from "@/theme";

interface Props {
  onPress(): void;
  accessibilityLabel: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
}

/** Botón flotante de acción principal (abajo a la derecha). La lista debe dejar ~96 px libres al pie. */
export function Fab({ onPress, accessibilityLabel, icon = "add" }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={30} color={colors.onPrimary} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    fab: {
      position: "absolute",
      right: space.lg,
      bottom: space.lg,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...shadow,
      elevation: 6,
    },
    pressed: { opacity: 0.85 },
  }),
);
