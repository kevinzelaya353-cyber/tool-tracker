import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { loginSchema, type LoginInput } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { space, makeStyles, useTheme } from "@/theme";
import LOGO from "../assets/brand/plexbird-mark.png";

export default function LoginScreen() {
  const styles = useStyles();
  const { font } = useTheme();
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
        <Image source={LOGO} style={styles.logo} accessibilityLabel="Plexbird" />
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

const useStyles = makeStyles(() =>
  StyleSheet.create({
    content: { flexGrow: 1, justifyContent: "center", gap: space.lg },
    brand: { alignItems: "center", gap: space.sm, marginBottom: space.lg },
    // Fondo transparente: solo la P, sobre el fondo de la pantalla en ambos temas.
    logo: { width: 104, height: 104 },
  }),
);
