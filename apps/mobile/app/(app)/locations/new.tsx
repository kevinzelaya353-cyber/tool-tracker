import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LocationType } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useCreateLocation } from "@/features/catalog/api";
import { space, useTheme } from "@/theme";

/** Alta de un proyecto (obra) o bodega con su dirección. */
export default function NewLocationScreen() {
  const { font } = useTheme();
  const create = useCreateLocation();
  const [type, setType] = useState<LocationType>("PROYECTO");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const submit = () =>
    create.mutate(
      { name: name.trim(), type, address: address.trim() || undefined },
      { onSuccess: () => (router.canGoBack() ? router.back() : router.replace("/locations")) },
    );

  return (
    <Screen
      footer={
        <Button
          title={type === "PROYECTO" ? "Registrar proyecto" : "Registrar bodega"}
          icon="checkmark"
          loading={create.isPending}
          disabled={!name.trim()}
          onPress={submit}
        />
      }
    >
      <ErrorBanner error={create.error} />
      <View style={styles.types}>
        <Text style={font.label}>Tipo</Text>
        <View style={styles.row}>
          <Chip label="Proyecto" selected={type === "PROYECTO"} onPress={() => setType("PROYECTO")} />
          <Chip label="Bodega" selected={type === "BODEGA"} onPress={() => setType("BODEGA")} />
        </View>
      </View>
      <TextField
        label="Nombre"
        value={name}
        onChangeText={setName}
        maxLength={120}
        placeholder={type === "PROYECTO" ? "Residencial Las Colinas" : "Bodega central"}
        autoFocus
      />
      <TextField
        label="Dirección o ubicación (opcional)"
        value={address}
        onChangeText={setAddress}
        maxLength={250}
        multiline
        placeholder="Colonia, ciudad, referencias…"
        hint="Aparece en el resumen del Excel exportado."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  types: { gap: space.xs },
  row: { flexDirection: "row", gap: space.sm },
});
