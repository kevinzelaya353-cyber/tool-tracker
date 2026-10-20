import * as Print from "expo-print";
import { Platform } from "react-native";

/**
 * Imprime un documento HTML (o lo guarda como PDF desde el diálogo del sistema).
 * En web, expo-print imprime la página entera: ahí se imprime desde un iframe oculto.
 */
export async function printHtml(html: string): Promise<void> {
  if (Platform.OS !== "web") {
    await Print.printAsync({ html });
    return;
  }
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = html;
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
  });
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  // print() bloquea hasta cerrar el diálogo en la mayoría de navegadores; se retira después.
  setTimeout(() => frame.remove(), 1000);
}
