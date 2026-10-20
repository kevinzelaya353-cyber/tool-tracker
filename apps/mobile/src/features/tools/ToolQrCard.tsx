import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { notify } from "@/lib/dialogs";
import { printHtml } from "@/lib/print";
import { space, useTheme } from "@/theme";
import { labelsHtml, qrPath, type QrLabel } from "./qr";

/** QR de la herramienta para imprimir y pegar; al escanearlo con la app abre su ficha. */
export function ToolQrCard({ label }: { label: QrLabel }) {
  const { font } = useTheme();
  const qr = useMemo(() => qrPath(label.code), [label.code]);
  const [printing, setPrinting] = useState(false);

  const print = async () => {
    setPrinting(true);
    try {
      await printHtml(labelsHtml([label]));
    } catch (e) {
      await notify("No se pudo imprimir", (e as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Card>
      <View style={styles.row}>
        {/* Fondo blanco fijo: en modo oscuro el QR debe seguir siendo negro sobre blanco. */}
        <Svg width={112} height={112} viewBox={`0 0 ${qr.size} ${qr.size}`}>
          <Rect width={qr.size} height={qr.size} fill="#FFFFFF" />
          <Path d={qr.d} fill="#000000" />
        </Svg>
        <View style={styles.flex}>
          <Text style={font.h2}>Etiqueta QR</Text>
          <Text style={font.small}>Imprímela y pégala en la herramienta. Al escanearla con la app se abre esta ficha.</Text>
        </View>
      </View>
      <Button title="Imprimir etiqueta" icon="print-outline" variant="secondary" compact loading={printing} onPress={print} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.sm },
  flex: { flex: 1, gap: space.xs },
});
