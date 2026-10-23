import { Controller, type Control } from "react-hook-form";
import type { ToolCreateInput } from "@tt/shared";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { SelectField, type CreateOption } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCategories, useCreateCategory } from "@/features/catalog/api";

/** Datos propios de la herramienta: los mismos al registrarla y al editarla. */
export type ToolFieldValues = Omit<ToolCreateInput, "id" | "initialLocationId" | "photoId">;

type TextKey = "code" | "brand" | "model" | "serial" | "purchasePrice" | "supplier";

/**
 * `financial=false` oculta precio y fecha de compra (al editar sin permiso de corregirlos: la API
 * tampoco los acepta ni envía el precio). Al dar de alta siempre se piden.
 */
export function ToolFields({ control, financial = true }: { control: Control<ToolFieldValues>; financial?: boolean }) {
  const categories = useCategories();
  const createCategory = useCreateCategory();
  const { can } = useAuth();
  const newCategory: CreateOption | undefined = can("catalog:write")
    ? { noun: "tipo de herramienta", onCreate: async (name) => (await createCategory.mutateAsync({ name })).id }
    : undefined;

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
    <>
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
      {financial ? text("purchasePrice", "Precio de compra", { keyboardType: "decimal-pad", placeholder: "0.00" }) : null}
      {financial ? (
        <Controller
          control={control}
          name="purchaseDate"
          render={({ field, fieldState }) => (
            <DateTimeField label="Fecha de compra" mode="date" value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
          )}
        />
      ) : null}
      {text("supplier", "Proveedor (opcional)")}
    </>
  );
}
