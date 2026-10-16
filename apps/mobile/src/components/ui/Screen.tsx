import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { space, makeStyles } from "@/theme";

interface Props {
  children: ReactNode;
  scroll?: boolean;
  /** Contenido fijo al pie (p. ej. botón principal de un formulario). */
  footer?: ReactNode;
  edges?: Edge[];
  contentStyle?: ViewStyle;
}

export function Screen({ children, scroll = true, footer, edges = ["bottom"], contentStyle }: Props) {
  const styles = useStyles();
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    content: { padding: space.lg, gap: space.lg },
    footer: {
      padding: space.lg,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
  }),
);
