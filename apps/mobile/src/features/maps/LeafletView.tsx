import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { radius } from "@/theme";

export interface LeafletViewProps {
  html: string;
  /** Sin alto fijo ocupa todo el espacio disponible (flex: 1), p. ej. a pantalla completa. */
  height?: number;
  onMessage?(data: unknown): void;
}

/** Teléfono: la página de Leaflet corre en un WebView. */
export function LeafletView({ html, height, onMessage }: LeafletViewProps) {
  return (
    <View style={[styles.wrap, height == null ? styles.fill : { height }]}>
      <WebView
        originWhitelist={["*"]}
        // baseUrl da un Referer válido a las teselas de OpenStreetMap (su política lo exige).
        source={{ html, baseUrl: "https://tooltracker.app/" }}
        onMessage={(e) => {
          try {
            onMessage?.(JSON.parse(e.nativeEvent.data));
          } catch {
            // mensaje no esperado: se ignora
          }
        }}
        javaScriptEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: "hidden" },
  fill: { flex: 1 },
});
