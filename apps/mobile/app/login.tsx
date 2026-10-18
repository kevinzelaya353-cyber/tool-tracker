import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { loginSchema, type LoginInput } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { radius, space, makeStyles, useTheme } from "@/theme";

export default function LoginScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { login } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [error, setError] = useState<unknown>(null);
  const { control, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.username, values.password);
    } catch (e) {
      setError(e);
    }
  });

  return (
    <Screen edges={["top", "bottom"]} contentStyle={styles.content}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="construct" size={36} color={colors.onPrimary} />
        </View>
        <Text style={font.title}>Control de Herramientas</Text>
        <Text style={font.small}>Trazabilidad de inventario en obra</Text>
      </View>

      <ErrorBanner error={error} />

      <Controller
        control={control}
        name="username"
        render={({ field, fieldState }) => (
          <TextField
            label="Usuario"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            ref={passwordRef}
            label="PIN"
            hint="4 dígitos. Si eres administrador, tu contraseña."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        )}
      />
      <Button title="Ingresar" onPress={onSubmit} loading={formState.isSubmitting} />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    content: { flexGrow: 1, justifyContent: "center", gap: space.lg },
    brand: { alignItems: "center", gap: space.sm, marginBottom: space.lg },
    logo: {
      width: 72,
      height: 72,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
