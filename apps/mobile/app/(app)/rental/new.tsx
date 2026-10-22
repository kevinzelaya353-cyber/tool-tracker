import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  RENTAL_MAX_PHOTOS,
  TOOL_CONDITION,
  TOOL_CONDITION_LABEL,
  rentalCreateSchema,
  type ToolCondition,
} from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useCategories, useLocations } from "@/features/catalog/api";
import { useCreateRental, type RentalPayload } from "@/features/rentals/api";
import { useTool } from "@/features/tools/api";
import { useConfirmDiscard } from "@/lib/useConfirmDiscard";
import { useFormId } from "@/lib/useFormId";
import { fieldErrors } from "@/lib/validation";
import { space, useTheme } from "@/theme";

const DAY_MS = 86_400_000;

/**
 * Recepción de una herramienta rentada: abre un período de alquiler y documenta cómo llegó
 * (estado, descripción y fotos). Sin ?toolId= la da de alta; con ?toolId= es un nuevo período
 * de una herramienta rentada que ya se había devuelto.
 */
export default function NewRentalScreen() {
  const { font, colors } = useTheme();
  const { toolId } = useLocalSearchParams<{ toolId?: string }>();
  const { user } = useAuth();
  const existing = useTool(toolId ?? "", !!toolId);
  const categories = useCategories();
  const locations = useLocations();
  const create = useCreateRental();
  const rentalId = useFormId();

  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState<string>();
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [coverId, setCoverId] = useState<string>();
  const [lessor, setLessor] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date());
  const [expectedReturnAt, setExpectedReturnAt] = useState<Date | null>(null);
  const [locationId, setLocationId] = useState<string>();
  const [notes, setNotes] = useState("");
  const [condition, setCondition] = useState<ToolCondition>();
  const [description, setDescription] = useState("");
  const [receptionNotes, setReceptionNotes] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const onPhotos = useCallback((ids: string[], busy: boolean) => {
    setPhotoIds(ids);
    setUploading(busy);
  }, []);
  const onCover = useCallback((ids: string[], busy: boolean) => {
    setCoverId(ids[0]);
    setCoverUploading(busy);
  }, []);

  const dirty =
    [code, brand, model, serial, lessor, notes, description, receptionNotes].some((v) => v.trim() !== "") ||
    !!categoryId || !!locationId || !!condition || photoIds.length > 0 || !!coverId || uploading || coverUploading;
  const leave = useConfirmDiscard(dirty && !create.isSuccess);

  if (toolId && existing.isLoading) return <Loading />;
  if (toolId && !existing.data) return <Screen><ErrorBanner error={existing.error} /></Screen>;

  const payload: RentalPayload = {
    id: rentalId,
    ...(toolId
      ? { toolId }
      : {
          tool: {
            code: code.trim().toUpperCase(),
            categoryId: categoryId ?? "",
            brand: brand.trim(),
            model: model.trim() || undefined,
            serial: serial.trim() || undefined,
            photoId: coverId,
          },
        }),
    lessor: lessor.trim(),
    receivedAt: receivedAt.toISOString(),
    expectedReturnAt: expectedReturnAt?.toISOString(),
    locationId: locationId ?? "",
    notes: notes.trim() || undefined,
    receptionCondition: condition as ToolCondition,
    receptionDescription: description.trim() || undefined,
    receptionNotes: receptionNotes.trim() || undefined,
    photoIds,
  };
  const errors = tried ? fieldErrors(rentalCreateSchema, payload) : {};
  const busy = uploading || coverUploading;

  const submit = () => {
    setTried(true);
    if (create.isPending || Object.keys(fieldErrors(rentalCreateSchema, payload)).length > 0) return;
    create.mutate(payload, { onSuccess: (r) => leave(() => router.replace(`/rental/${r.id}`)) });
  };

  return (
    <Screen
      footer={
        <Button
          title={busy ? "Subiendo fotos…" : "Registrar recepción"}
          icon="checkmark"
          loading={create.isPending}
          disabled={busy}
          onPress={submit}
        />
      }
    >
      <ErrorBanner error={create.error} />
      {tried && Object.keys(errors).length > 0 ? (
        <Text style={[font.small, { color: colors.danger }]}>Revisa los campos marcados.</Text>
      ) : null}

      <Text style={font.h2}>Herramienta</Text>
      {toolId && existing.data ? (
        <Card>
          <Text style={font.h2}>
            {existing.data.code} · {existing.data.category.name} {existing.data.brand}
          </Text>
          <Text style={font.small}>Nuevo período de alquiler (los anteriores se conservan por separado).</Text>
        </Card>
      ) : (
        <>
          <PhotoPicker label="Foto de la herramienta (opcional)" max={1} onChange={onCover} />
          <TextField
            label="Código interno"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="REN-001"
            hint="Se imprime como QR en la herramienta"
            error={errors["tool.code"]}
          />
          <SelectField
            label="Tipo de herramienta"
            value={categoryId}
            onChange={setCategoryId}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            error={errors["tool.categoryId"] ? "Selecciona un tipo" : undefined}
          />
          <TextField label="Marca" value={brand} onChangeText={setBrand} error={errors["tool.brand"]} />
          <TextField label="Modelo (opcional)" value={model} onChangeText={setModel} />
          <TextField label="Número de serie (opcional)" value={serial} onChangeText={setSerial} autoCapitalize="characters" />
        </>
      )}

      <Text style={font.h2}>Alquiler</Text>
      <TextField
        label="Empresa o persona arrendadora"
        value={lessor}
        onChangeText={setLessor}
        maxLength={120}
        error={errors.lessor}
      />
      <DateTimeField label="Fecha de recepción" value={receivedAt} onChange={setReceivedAt} error={errors.receivedAt} />
      {expectedReturnAt ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateTimeField
              label="Devolución prevista"
              mode="date"
              allowFuture
              value={expectedReturnAt}
              onChange={setExpectedReturnAt}
              error={errors.expectedReturnAt}
            />
          </View>
          <Pressable onPress={() => setExpectedReturnAt(null)} hitSlop={8} style={styles.clear} accessibilityLabel="Quitar fecha prevista">
            <Text style={[font.small, { color: colors.primaryDark }]}>Quitar</Text>
          </Pressable>
        </View>
      ) : (
        <Button
          title="Agregar fecha prevista de devolución"
          icon="calendar-outline"
          variant="secondary"
          compact
          onPress={() => setExpectedReturnAt(new Date(receivedAt.getTime() + 7 * DAY_MS))}
        />
      )}
      <SelectField
        label="Dónde se recibe"
        value={locationId}
        onChange={setLocationId}
        options={(locations.data ?? [])
          .filter((l) => l.active)
          .map((l) => ({ value: l.id, label: l.name, description: l.type === "BODEGA" ? "Bodega" : "Proyecto" }))}
        error={errors.locationId ? "Selecciona la bodega o el proyecto" : undefined}
      />
      <TextField label="Observaciones del alquiler (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />

      <Text style={font.h2}>Estado al recibirla</Text>
      <ChoiceChips
        label="Estado físico"
        value={condition}
        options={TOOL_CONDITION}
        labels={TOOL_CONDITION_LABEL}
        onChange={setCondition}
        error={errors.receptionCondition ? "Indica cómo llegó" : undefined}
      />
      <TextField
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={500}
        hint="Rayones, golpes o piezas faltantes que ya traía."
      />
      <TextField label="Observaciones (opcional)" value={receptionNotes} onChangeText={setReceptionNotes} multiline maxLength={500} />
      <PhotoPicker
        label="Fotos de recepción"
        hint={`Hasta ${RENTAL_MAX_PHOTOS}. Quedan como evidencia original para comparar al devolverla.`}
        max={RENTAL_MAX_PHOTOS}
        onChange={onPhotos}
      />
      <Text style={font.small}>Recibe: {user?.name ?? "—"}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  flex: { flex: 1 },
  clear: { paddingBottom: space.md },
});
