import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import {
  DAMAGE_KIND,
  DAMAGE_KIND_LABEL,
  DAMAGE_MAX_PHOTOS,
  TOOL_CONDITION,
  TOOL_CONDITION_LABEL,
  TOOL_STATUS_LABEL,
  canReportDamage,
  resolveTransition,
  type DamageKind,
  type ToolCondition,
} from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useCreateDamageReport } from "@/features/damage/api";
import { useToolRentals } from "@/features/rentals/api";
import { useTool } from "@/features/tools/api";
import { useConfirmDiscard } from "@/lib/useConfirmDiscard";
import { useFormId } from "@/lib/useFormId";
import { useTheme } from "@/theme";

/**
 * Reporte de daño con hasta 3 fotos. Siempre crea un registro nuevo: si la herramienta ya tenía
 * daños, este se suma a su historial. Si está rentada, queda como incidencia de su alquiler activo.
 */
export default function NewDamageReportScreen() {
  const { font, colors } = useTheme();
  const { toolId } = useLocalSearchParams<{ toolId: string }>();
  const { user } = useAuth();
  const tool = useTool(toolId);
  const rented = tool.data?.ownership === "RENTADA";
  const rentals = useToolRentals(toolId, rented);
  const activeRental = rentals.data?.find((r) => r.status === "ACTIVO");
  const create = useCreateDamageReport();
  const reportId = useFormId();

  const [occurredAt, setOccurredAt] = useState(new Date());
  const [kind, setKind] = useState<DamageKind>();
  const [condition, setCondition] = useState<ToolCondition>();
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const onPhotos = useCallback((ids: string[], busy: boolean) => {
    setPhotoIds(ids);
    setUploading(busy);
  }, []);

  const dirty = !!kind || !!condition || description.trim() !== "" || notes.trim() !== "" || photoIds.length > 0 || uploading;
  const leave = useConfirmDiscard(dirty && !create.isSuccess);

  if (tool.isLoading) return <Loading />;
  if (!tool.data) return <Screen><ErrorBanner error={tool.error} /></Screen>;
  const t = tool.data;

  const missing = { kind: !kind, condition: !condition, description: description.trim() === "" };
  const invalid = missing.kind || missing.condition || missing.description;
  const marksDamaged = condition === "NO_OPERATIVA" && resolveTransition(t.status, "DAMAGE").ok;

  const submit = () => {
    setTried(true);
    if (invalid || create.isPending) return;
    create.mutate(
      {
        id: reportId,
        toolId,
        occurredAt: occurredAt.toISOString(),
        kind: kind!,
        condition: condition!,
        description: description.trim(),
        notes: notes.trim() || undefined,
        photoIds,
      },
      { onSuccess: () => leave(() => (router.canGoBack() ? router.back() : router.replace(`/tool/${toolId}`))) },
    );
  };

  if (!canReportDamage(t.status)) {
    return (
      <Screen>
        <Card>
          <Text style={font.h2}>{t.code}</Text>
          <Text style={font.body}>No se pueden reportar daños de una herramienta en estado «{TOOL_STATUS_LABEL[t.status] ?? t.status}».</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          title={uploading ? "Subiendo fotos…" : "Guardar reporte"}
          icon="checkmark"
          variant="danger"
          loading={create.isPending}
          disabled={uploading}
          onPress={submit}
        />
      }
    >
      <Card>
        <Text style={font.h2}>
          {t.code} · {t.category.name} {t.brand}
        </Text>
        <Text style={font.small}>
          {(TOOL_STATUS_LABEL[t.status] ?? t.status).replace(" (disponible)", "")}
          {marksDamaged ? ` → ${TOOL_STATUS_LABEL.DANADA}` : ""}
        </Text>
        {activeRental ? (
          <Text style={[font.small, { color: colors.primaryDark }]}>Se registrará como incidencia del alquiler de {activeRental.lessor}.</Text>
        ) : null}
      </Card>

      <ErrorBanner error={create.error} />

      <DateTimeField label="Fecha del reporte" value={occurredAt} onChange={setOccurredAt} />
      <ChoiceChips
        label="Tipo de daño"
        value={kind}
        options={DAMAGE_KIND}
        labels={DAMAGE_KIND_LABEL}
        onChange={setKind}
        error={tried && missing.kind ? "Elige el tipo de daño" : undefined}
      />
      <ChoiceChips
        label="Estado de la herramienta"
        value={condition}
        options={TOOL_CONDITION}
        labels={TOOL_CONDITION_LABEL}
        onChange={setCondition}
        error={tried && missing.condition ? "Indica cómo quedó la herramienta" : undefined}
      />
      {condition === "NO_OPERATIVA" && !marksDamaged ? (
        <Text style={font.small}>El estado de la herramienta no cambia; el reporte se agrega a su historial.</Text>
      ) : null}
      <TextField
        label="Descripción del problema"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={500}
        error={tried && missing.description ? "Describe el daño" : undefined}
        hint="Qué se dañó, cómo y dónde."
      />
      <TextField label="Observaciones (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />
      <PhotoPicker
        label="Fotos del daño"
        hint={`Hasta ${DAMAGE_MAX_PHOTOS}. Toca la ✕ para quitar una antes de guardar.`}
        max={DAMAGE_MAX_PHOTOS}
        onChange={onPhotos}
      />
      <Text style={font.small}>Reporta: {user?.name ?? "—"}</Text>
    </Screen>
  );
}
