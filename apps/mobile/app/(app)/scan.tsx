import { router } from "expo-router";
import { useState } from "react";
import { notify } from "@/lib/dialogs";
import { QrScanner } from "@/features/camera/QrScanner";
import { fetchToolByCode } from "@/features/tools/api";
import { ApiError } from "@/lib/api";

/** Escanear para abrir el detalle de una herramienta. */
export default function ScanScreen() {
  const [busy, setBusy] = useState(false);

  const onScanned = async (code: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const tool = await fetchToolByCode(code);
      router.replace(`/tool/${tool.id}`);
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 404 ? `No existe una herramienta con código ${code}` : (e as Error).message;
      await notify("Código no reconocido", msg);
      setBusy(false);
    }
  };

  return <QrScanner onScanned={onScanned} onClose={() => router.back()} />;
}
