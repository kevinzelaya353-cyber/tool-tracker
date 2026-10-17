import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { api } from "@/lib/api";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Descarga el inventario en Excel (una pestaña por proyecto/bodega, con fotos) y lo ofrece
 * para guardar o compartir (WhatsApp, correo, Drive…). En web se descarga directamente.
 */
export async function exportInventoryExcel(): Promise<void> {
  const bytes = new Uint8Array(await api.download("/api/reports/export/inventory.xlsx"));
  const name = `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Este dispositivo no permite compartir archivos");
  await Sharing.shareAsync(file.uri, {
    mimeType: XLSX_MIME,
    UTI: "org.openxmlformats.spreadsheetml.sheet",
    dialogTitle: "Exportar inventario",
  });
}
