import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { radius, space, makeStyles, useTheme } from "@/theme";

interface Props extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export const TextField = forwardRef<TextInput, Props>(function TextField({ label, error, hint, style, ...rest }, ref) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={font.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? styles.inputError : null, rest.multiline && styles.multiline, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={font.small}>{hint}</Text> : null}
    </View>
  );
});

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: space.xs },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      backgroundColor: colors.surface,
      fontSize: 15,
      color: colors.text,
    },
    multiline: { minHeight: 90, paddingTop: space.md, textAlignVertical: "top" },
    inputError: { borderColor: colors.danger },
    error: { fontSize: 13, color: colors.danger },
  }),
);
