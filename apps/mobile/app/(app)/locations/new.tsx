import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { LocationType } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useCreateLocation, useLocations, useUpdateLocation } from "@/features/catalog/api";
import type { LatLng } from "@/features/maps/leaflet-html";
import { LocationPicker } from "@/features/maps/LocationPicker";
import { space, useTheme } from "@/theme";

/** Alta de un proyecto (obra) o bodega con su dirección y punto en el mapa; con ?id= edita una existente. */
export default function NewLocationScreen() {
  const { font } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const locations = useLocations();
  const existing = id ? locations.data?.find((l) => l.id === id) : undefined;
  const create = useCreateLocation();
  const update = useUpdateLocation(id ?? "");
  const mutation = id ? update : create;
  const [type, setType] = useState<LocationType>("PROYECTO");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [point, setPoint] = useState<LatLng | null>(null);
  const [loaded, setLoaded] = useState(!id);

  // Al editar, el formulario arranca con los datos guardados (una sola vez).
  useEffect(() => {
    if (!existing || loaded) return;
    setType(existing.type);
    setName(existing.name);
    setAddress(existing.address ?? "");
    setPoint(existing.latitude != null && existing.longitude != null ? { lat: existing.latitude, lng: existing.longitude } : null);
    setLoaded(true);
  }, [existing, loaded]);

  const done = () => (router.canGoBack() ? router.back() : router.replace("/locations"));
  const submit = () => {
    const coords = { latitude: point?.lat ?? null, longitude: point?.lng ?? null };
    if (id) {
      update.mutate({ name: name.trim(), address: address.trim() || undefined, ...coords }, { onSuccess: done });
    } else {
      create.mutate(
        {
          name: name.trim(),
          type,
          address: address.trim() || undefined,
          ...(point && { latitude: point.lat, longitude: point.lng }),
        },
        { onSuccess: done },
      );
    }
  };

  if (!loaded) return locations.isLoading ? <Loading /> : <Screen><ErrorBanner error={locations.error} /></Screen>;
  const noun = type === "PROYECTO" ? "proyecto" : "bodega";

  return (
    <Screen
      footer={
        <Button
          title={id ? "Guardar cambios" : `Registrar ${noun}`}
          icon="checkmark"
          loading={mutation.isPending}
          disabled={!name.trim()}
          onPress={submit}
        />
      }
    >
      <Stack.Screen options={{ title: id ? `Editar ${noun}` : "Nuevo proyecto o bodega" }} />
      <ErrorBanner error={mutation.error} />
      {id ? null : (
        <View style={styles.types}>
          <Text style={font.label}>Tipo</Text>
          <View style={styles.row}>
            <Chip label="Proyecto" selected={type === "PROYECTO"} onPress={() => setType("PROYECTO")} />
            <Chip label="Bodega" selected={type === "BODEGA"} onPress={() => setType("BODEGA")} />
          </View>
        </View>
      )}
      <TextField
        label="Nombre"
        value={name}
        onChangeText={setName}
        maxLength={120}
        placeholder={type === "PROYECTO" ? "Residencial Las Colinas" : "Bodega central"}
        autoFocus={!id}
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
      <LocationPicker value={point} onChange={setPoint} />
      <Text style={font.small}>Con el punto marcado, cada traslado desde o hacia aquí muestra la ruta en el mapa.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  types: { gap: space.xs },
  row: { flexDirection: "row", gap: space.sm },
});
