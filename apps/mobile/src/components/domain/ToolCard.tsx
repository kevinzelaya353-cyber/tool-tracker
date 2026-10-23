import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/features/auth/AuthProvider";
import { formatMoney } from "@/lib/format";
import type { Tool } from "@/types/api";
import { radius, space, makeStyles, useTheme } from "@/theme";
import { StatusBadge } from "./StatusBadge";

interface Props {
  tool: Tool;
  onPress?: () => void;
  /** Modo selección (wizard de traslado). */
  selected?: boolean;
  /** URL firmada de la miniatura de su foto (las pide la lista por lotes). */
  thumbUrl?: string;
}

/** Valor de compra para el listado: solo quien puede ver valores lo recibe de la API. */
function toolValue(tool: Tool): { text: string; missing: boolean } | null {
  if (tool.purchasePrice === undefined) return null; // sin permiso: la API no lo envía
  if (tool.ownership === "RENTADA") return { text: "Rentada · sin valor de compra", missing: true };
  if (Number(tool.purchasePrice) <= 0) return { text: "Valor no registrado", missing: true };
  return { text: formatMoney(tool.purchasePrice), missing: false };
}

export function ToolCard({ tool, onPress, selected, thumbUrl }: Props) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const { can } = useAuth();
  const value = can("finance:read") ? toolValue(tool) : null;
  return (
    <Card onPress={onPress} style={selected ? styles.selected : undefined}>
      <View style={styles.row}>
        {/* La foto identifica la herramienta de un vistazo; el código y la serie solos no bastan. */}
        {thumbUrl ? (
          <Image source={{ uri: thumbUrl }} style={styles.thumb} accessibilityLabel={`Foto de ${tool.code}`} />
        ) : (
          <View style={[styles.thumb, styles.noThumb]}>
            <Ionicons name={tool.coverPhotoId ? "image-outline" : "hammer-outline"} size={22} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.flex}>
          <Text style={styles.code}>{tool.code}</Text>
          <Text style={font.body} numberOfLines={1}>
            {tool.category.name} · {tool.brand}
            {tool.model ? ` ${tool.model}` : ""}
          </Text>
          {value ? (
            <Text style={value.missing ? styles.valueMissing : styles.value} numberOfLines={1}>
              {value.text}
            </Text>
          ) : null}
        </View>
        {selected !== undefined ? (
          <Ionicons
            name={selected ? "checkmark-circle" : "ellipse-outline"}
            size={26}
            color={selected ? colors.primaryDark : colors.border}
          />
        ) : (
          <StatusBadge status={tool.status} />
        )}
      </View>
      {tool.currentLocation ? (
        <View style={styles.meta}>
          <Ionicons name={tool.currentLocation.type === "BODEGA" ? "home-outline" : "construct-outline"} size={14} color={colors.textMuted} />
          <Text style={font.small} numberOfLines={1}>
            {tool.currentLocation.name}
            {tool.currentCustodian ? ` · a cargo de ${tool.currentCustodian.name}` : ""}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space.md },
    flex: { flex: 1, gap: 2 },
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
    value: { fontSize: 14, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
    valueMissing: { fontSize: 12, fontStyle: "italic", color: colors.textMuted },
    meta: { flexDirection: "row", alignItems: "center", gap: space.xs },
    selected: { borderWidth: 2, borderColor: colors.primary },
    thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.neutralSoft },
    noThumb: { alignItems: "center", justifyContent: "center" },
  }),
);
