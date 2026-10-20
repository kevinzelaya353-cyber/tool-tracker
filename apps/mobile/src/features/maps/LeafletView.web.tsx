import { useEffect, useRef } from "react";
import { radius } from "@/theme";
import type { LeafletViewProps } from "./LeafletView";

/** Web: react-native-webview no existe en el navegador; se usa un iframe aislado (srcdoc). */
export function LeafletView({ html, height, onMessage }: LeafletViewProps) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!onMessage) return;
    const handler = (e: MessageEvent) => {
      // Solo mensajes de nuestro propio iframe.
      if (e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        // mensaje no esperado: se ignora
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMessage]);

  return (
    <iframe
      ref={frame}
      srcDoc={html}
      title="Mapa"
      // allow-same-origin no: el mapa no necesita acceso a la sesión de la app.
      sandbox="allow-scripts"
      style={{ width: "100%", height: height ?? "100%", border: "none", borderRadius: radius.md, display: "block" }}
    />
  );
}
