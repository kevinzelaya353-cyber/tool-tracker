import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Text } from "react-native";
import { toolCreateSchema, type ToolUpdateInput } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { useTool, useUpdateTool } from "@/features/tools/api";
import { ToolFields, type ToolFieldValues } from "@/features/tools/ToolFields";
import type { ToolDetail } from "@/types/api";
import { useConfirmDiscard } from "@/lib/useConfirmDiscard";
import { useTheme } from "@/theme";

const schema = toolCreateSchema.omit({ id: true, initialLocationId: true, photoId: true });

/** La fecha de compra se guarda como día (UTC); en el selector se muestra ese mismo día en hora local. */
const purchaseDay = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const toForm = (t: ToolDetail): ToolFieldValues => ({
  code: t.code,
  categoryId: t.category.id,
  brand: t.brand,
  model: t.model ?? "",
  serial: t.serial ?? "",
  purchasePrice: t.purchasePrice,
  purchaseDate: purchaseDay(t.purchaseDate),
  supplier: t.supplier ?? "",
});

/** Edita todos los datos de una herramienta ya registrada. La foto se cambia desde su ficha. */
export default function EditToolScreen() {
  const { font } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tool = useTool(id);
  const update = useUpdateTool(id);
  const { control, handleSubmit, reset, formState } = useForm<ToolFieldValues>({ resolver: zodResolver(schema) });
  const leave = useConfirmDiscard(formState.isDirty);

  // El formulario arranca con los datos guardados (una sola vez: no pisa lo que se va escribiendo).
  const loaded = formState.defaultValues?.code !== undefined;
  useEffect(() => {
    if (tool.data && !loaded) reset(toForm(tool.data));
  }, [tool.data, loaded, reset]);

  // Solo los campos cambiados: la API audita cada cambio y valida la fecha contra el historial.
  const onSubmit = handleSubmit((values) => {
    const changed = Object.fromEntries(
      Object.entries(values).filter(([k]) => formState.dirtyFields[k as keyof ToolFieldValues]),
    ) as ToolUpdateInput;
    if (Object.keys(changed).length === 0) return leave(() => router.back());
    update.mutate(changed, { onSuccess: () => leave(() => (router.canGoBack() ? router.back() : router.replace(`/tool/${id}`))) });
  });

  if (tool.isLoading || (tool.data && !loaded)) return <Loading />;
  if (!tool.data) return <Screen><ErrorBanner error={tool.error} /></Screen>;

  return (
    <Screen footer={<Button title="Guardar cambios" icon="checkmark" onPress={onSubmit} loading={update.isPending} />}>
      <ErrorBanner error={update.error} />
      <ToolFields control={control} />
      <Text style={font.small}>La foto se cambia desde la ficha de la herramienta.</Text>
    </Screen>
  );
}
