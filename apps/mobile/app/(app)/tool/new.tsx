import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toolCreateSchema, type ToolCreateInput } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField, type CreateOption } from "@/components/ui/SelectField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useCreateLocation, useLocations } from "@/features/catalog/api";
import { useCreateTool } from "@/features/tools/api";
import { ToolFields, type ToolFieldValues } from "@/features/tools/ToolFields";
import { useConfirmDiscard } from "@/lib/useConfirmDiscard";

export default function NewToolScreen() {
  const bodegas = useLocations("BODEGA");
  const create = useCreateTool();
  const { can } = useAuth();
  const createLocation = useCreateLocation();
  const newBodega: CreateOption | undefined = can("catalog:write")
    ? {
        noun: "bodega",
        detailLabel: "Dirección (opcional)",
        onCreate: async (name, address) => (await createLocation.mutateAsync({ name, type: "BODEGA", address })).id,
      }
    : undefined;
  const { control, handleSubmit, formState } = useForm<ToolCreateInput>({
    resolver: zodResolver(toolCreateSchema),
    defaultValues: { code: "", brand: "", purchasePrice: "", purchaseDate: new Date() },
  });

  const [photoId, setPhotoId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const onPhoto = useCallback((ids: string[], busy: boolean) => {
    setPhotoId(ids[0]);
    setUploading(busy);
  }, []);
  const leave = useConfirmDiscard(formState.isDirty || !!photoId || uploading);

  const onSubmit = handleSubmit((values) =>
    create.mutate({ ...values, photoId }, { onSuccess: (tool) => leave(() => router.replace(`/tool/${tool.id}`)) }),
  );

  return (
    <Screen
      footer={
        <Button
          title={uploading ? "Subiendo foto…" : "Registrar herramienta"}
          onPress={onSubmit}
          disabled={uploading}
          loading={create.isPending}
        />
      }
    >
      <ErrorBanner error={create.error} />
      <PhotoPicker label="Foto de la herramienta (opcional)" max={1} onChange={onPhoto} />
      {/* Mismos campos que al editar; el formulario de alta además lleva foto y bodega. */}
      <ToolFields control={control as unknown as Control<ToolFieldValues>} />
      <Controller
        control={control}
        name="initialLocationId"
        render={({ field, fieldState }) => (
          <SelectField
            label="Bodega de ingreso"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error ? "Selecciona una bodega" : undefined}
            options={(bodegas.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
            create={newBodega}
          />
        )}
      />
    </Screen>
  );
}
