import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import { RENTAL_MAX_PHOTOS, TOOL_CONDITION, TOOL_CONDITION_LABEL, type ToolCondition } from "@tt/shared";
import { PhotoStrip } from "@/components/domain/PhotoStrip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useRental, useReturnRental } from "@/features/rentals/api";
import { formatDateTime } from "@/lib/format";
import { useConfirmDiscard } from "@/lib/useConfirmDiscard";
import { useTheme } from "@/theme";

/**
 * Devolución al arrendador. Muestra cómo se recibió para comparar; sus fotos se guardan aparte
 * y nunca reemplazan a las de recepción.
 */
export default function ReturnRentalScreen() {
  const { font, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const rental = useRental(id);
  const ret = useReturnRental(id);

  // La fecha se fija al abrir: si el envío se reintenta, la API reconoce la misma devolución.
  const [returnedAt, setReturnedAt] = useState(new Date());
  const [condition, setCondition] = useState<ToolCondition>();
  const [differences, setDifferences] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const onPhotos = useCallback((ids: string[], busy: boolean) => {
    setPhotoIds(ids);
    setUploading(busy);
  }, []);

  const dirty = !!condition || [differences, description, notes].some((v) => v.trim() !== "") || photoIds.length > 0 || uploading;
  const leave = useConfirmDiscard(dirty && !ret.isSuccess);

  if (rental.isLoading) return <Loading />;
  if (!rental.data) return <Screen><ErrorBanner error={rental.error} /></Screen>;
  const r = rental.data;

  if (r.status !== "ACTIVO") {
    return (
      <Screen>
        <Card>
          <Text style={font.h2}>{r.tool.code}</Text>
          <Text style={font.body}>Este alquiler ya se devolvió.</Text>
          <Button title="Ver alquiler" onPress={() => router.replace(`/rental/${r.id}`)} />
        </Card>
      </Screen>
    );
  }

  const submit = () => {
    setTried(true);
    if (!condition || ret.isPending) return;
    ret.mutate(
      {
        returnedAt: returnedAt.toISOString(),
        returnCondition: condition,
        differences: differences.trim() || undefined,
        returnDescription: description.trim() || undefined,
        returnNotes: notes.trim() || undefined,
        photoIds,
      },
      { onSuccess: () => leave(() => router.replace(`/rental/${id}`)) },
    );
  };

  return (
    <Screen
      footer={
        <Button
          title={uploading ? "Subiendo fotos…" : "Registrar devolución"}
          icon="checkmark"
          loading={ret.isPending}
          disabled={uploading}
          onPress={submit}
        />
      }
    >
      <Card>
        <Text style={font.h2}>
          {r.tool.code} · {r.tool.category.name} {r.tool.brand}
        </Text>
        <Text style={font.small}>
          Recibida {formatDateTime(r.receivedAt)} de {r.lessor}
        </Text>
        <Text style={[font.body, { fontWeight: "600" }]}>Al recibirla: {TOOL_CONDITION_LABEL[r.receptionCondition] ?? r.receptionCondition}</Text>
        {r.receptionDescription ? <Text style={font.small}>{r.receptionDescription}</Text> : null}
        <PhotoStrip ids={r.photos.filter((p) => p.stage === "RECEPCION").map((p) => p.id)} />
        {r.incidents.length > 0 ? (
          <Text style={[font.small, { color: colors.warning }]}>{r.incidents.length} incidencia(s) registradas durante el alquiler.</Text>
        ) : null}
      </Card>

      <ErrorBanner error={ret.error} />

      <DateTimeField label="Fecha de devolución" value={returnedAt} onChange={setReturnedAt} />
      <ChoiceChips
        label="Estado físico al devolverla"
        value={condition}
        options={TOOL_CONDITION}
        labels={TOOL_CONDITION_LABEL}
        onChange={setCondition}
        error={tried && !condition ? "Indica cómo se devuelve" : undefined}
      />
      <TextField
        label="Diferencias respecto a la recepción"
        value={differences}
        onChangeText={setDifferences}
        multiline
        maxLength={500}
        hint="Golpes nuevos, piezas faltantes… Deja vacío si se devuelve igual."
      />
      <TextField label="Descripción (opcional)" value={description} onChangeText={setDescription} multiline maxLength={500} />
      <TextField label="Observaciones (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />
      <PhotoPicker
        label="Fotos de devolución"
        hint={`Hasta ${RENTAL_MAX_PHOTOS}. Se guardan aparte de las de recepción.`}
        max={RENTAL_MAX_PHOTOS}
        onChange={onPhotos}
      />
      <Text style={font.small}>Registra: {user?.name ?? "—"}</Text>
    </Screen>
  );
}
