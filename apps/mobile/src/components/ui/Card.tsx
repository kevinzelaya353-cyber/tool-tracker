import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { radius, space, makeStyles } from "@/theme";

interface Props {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, onPress, style }: Props) {
  const styles = useStyles();
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.sm,
      ...shadow,
    },
    pressed: { opacity: 0.85 },
  }),
);
