import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import { confirmAsync } from "@/lib/dialogs";
import { EVENT_REQUIRES_LOCATION, TOOL_STATUS_LABEL, resolveTransition, type ManualEventType } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useLocations } from "@/features/catalog/api";
import { useCreateLifecycleEvent } from "@/features/lifecycle/api";
import { useTool } from "@/features/tools/api";
import { EVENT_ACTION } from "@/lib/format";
import { useTheme } from "@/theme";

const COST_EVENTS: ManualEventType[] = ["MAINTENANCE_START", "MAINTENANCE_END", "DAMAGE"];
const HINT: Partial<Record<ManualEventType, string>> = {
  DAMAGE: "Describe el daño y toma fotos que lo muestren.",
  LOSS: "Indica dónde y cuándo se vio por última vez.",
  MAINTENANCE_START: "Taller o técnico, y el motivo del mantenimiento.",
  MAINTENANCE_END: "Trabajo realizado. La herramienta regresa a la bodega elegida.",
  RECOVERY: "Dónde se encontró. La herramienta ingresa a la bodega elegida.",
  DECOMMISSION: "Motivo de la baja. Esta acción es definitiva.",
};

export default function NewEventScreen() {
  const { font } = useTheme();
  const { toolId, type } = useLocalSearchParams<{ toolId: string; type: ManualEventType }>();
  const tool = useTool(toolId);
  const needsLocation = !!EVENT_REQUIRES_LOCATION[type];
  const bodegas = useLocations("BODEGA");
  const create = useCreateLifecycleEvent();

  const [occurredAt, setOccurredAt] = useState(new Date());
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [locationId, setLocationId] = useState<string>();
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const onPhotos = useCallback((ids: string[], busy: boolean) => {
    setPhotoIds(ids);
    setUploading(busy);
  }, []);

  if (tool.isLoading) return <Loading />;
  if (!tool.data) return <Screen><ErrorBanner error={tool.error} /></Screen>;

  const toolCode = tool.data.code;
  const preview = resolveTransition(tool.data.status, type, needsLocation ? "BODEGA" : undefined);
  const costInvalid = cost !== "" && !/^\d{1,10}(\.\d{1,2})?$/.test(cost);

  const submit = async () => {
    const send = () =>
      create.mutate(
        {
          toolId,
          type,
          occurredAt: occurredAt.toISOString(),
          description: description.trim() || undefined,
          cost: cost || undefined,
          locationId: needsLocation ? locationId : undefined,
          photoIds,
        },
        { onSuccess: () => router.back() },
      );
    if (type !== "DECOMMISSION") return send();
    const ok = await confirmAsync("Dar de baja", `¿Dar de baja ${toolCode}? No se puede deshacer.`, {
      confirmText: "Dar de baja",
      destructive: true,
    });
    if (ok) send();
  };

  return (
    <Screen
      footer={
        <Button
          title={EVENT_ACTION[type] ?? "Registrar"}
          variant={type === "DAMAGE" || type === "LOSS" || type === "DECOMMISSION" ? "danger" : "primary"}
          loading={create.isPending}
          disabled={uploading || costInvalid || (needsLocation && !locationId)}
          onPress={submit}
        />
      }
    >
      <Card>
        <Text style={font.h2}>
          {tool.data.code} · {tool.data.category.name} {tool.data.brand}
        </Text>
        {preview.ok ? (
          <Text style={font.small}>
            {TOOL_STATUS_LABEL[tool.data.status]} → {TOOL_STATUS_LABEL[preview.to]}
          </Text>
        ) : null}
      </Card>

      <ErrorBanner error={create.error} />

      <DateTimeField label="Fecha y hora" value={occurredAt} onChange={setOccurredAt} />
      {needsLocation ? (
        <SelectField
          label="Bodega de destino"
          value={locationId}
          onChange={setLocationId}
          options={(bodegas.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
        />
      ) : null}
      {COST_EVENTS.includes(type) ? (
        <TextField
          label="Costo (opcional)"
          value={cost}
          onChangeText={setCost}
          keyboardType="decimal-pad"
          placeholder="0.00"
          error={costInvalid ? "Monto inválido (máx. 2 decimales)" : undefined}
        />
      ) : null}
      <TextField label="Descripción" value={description} onChangeText={setDescription} multiline maxLength={500} hint={HINT[type]} />
      <PhotoPicker onChange={onPhotos} />
    </Screen>
  );
}
