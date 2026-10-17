import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toolCreateSchema, type ToolCreateInput } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { ErrorBanner } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField, type CreateOption } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useCategories, useCreateCategory, useCreateLocation, useLocations } from "@/features/catalog/api";
import { useCreateTool } from "@/features/tools/api";

type TextKey = "code" | "brand" | "model" | "serial" | "purchasePrice" | "supplier";

export default function NewToolScreen() {
  const categories = useCategories();
  const bodegas = useLocations("BODEGA");
  const create = useCreateTool();
  const { can } = useAuth();
  const createCategory = useCreateCategory();
  const createLocation = useCreateLocation();
  const canCatalog = can("catalog:write");
  const newCategory: CreateOption | undefined = canCatalog
    ? { noun: "tipo de herramienta", onCreate: async (name) => (await createCategory.mutateAsync({ name })).id }
    : undefined;
  const newBodega: CreateOption | undefined = canCatalog
    ? {
        noun: "bodega",
        detailLabel: "Dirección (opcional)",
        onCreate: async (name, address) => (await createLocation.mutateAsync({ name, type: "BODEGA", address })).id,
      }
    : undefined;
  const { control, handleSubmit } = useForm<ToolCreateInput>({
    resolver: zodResolver(toolCreateSchema),
    defaultValues: { code: "", brand: "", purchasePrice: "", purchaseDate: new Date() },
  });

  const [photoId, setPhotoId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const onPhoto = useCallback((ids: string[], busy: boolean) => {
    setPhotoId(ids[0]);
    setUploading(busy);
  }, []);

  const onSubmit = handleSubmit((values) =>
    create.mutate({ ...values, photoId }, { onSuccess: (tool) => router.replace(`/tool/${tool.id}`) }),
  );

  const text = (name: TextKey, label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          value={field.value ?? ""}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          {...extra}
        />
      )}
    />
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
      {text("code", "Código interno", { autoCapitalize: "characters", placeholder: "TAL-001", hint: "Se imprime como QR en la herramienta" })}
      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => (
          <SelectField
            label="Tipo de herramienta"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error ? "Selecciona un tipo" : undefined}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            create={newCategory}
          />
        )}
      />
      {text("brand", "Marca")}
      {text("model", "Modelo (opcional)")}
      {text("serial", "Número de serie (opcional)", { autoCapitalize: "characters" })}
      {text("purchasePrice", "Precio de compra", { keyboardType: "decimal-pad", placeholder: "0.00" })}
      <Controller
        control={control}
        name="purchaseDate"
        render={({ field, fieldState }) => (
          <DateTimeField label="Fecha de compra" mode="date" value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
        )}
      />
      {text("supplier", "Proveedor (opcional)")}
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
