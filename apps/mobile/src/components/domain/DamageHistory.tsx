import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { DAMAGE_KIND_LABEL, TOOL_CONDITION_LABEL, TOOL_STATUS_LABEL } from "@tt/shared";
import { Card } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/format";
import type { DamageReport } from "@/types/api";
import { space, useTheme } from "@/theme";
import { PhotoStrip } from "./PhotoStrip";

/** Reportes de daño en orden cronológico; cada uno con sus propias fotos y observaciones. */
export function DamageHistory({ reports, empty = "Sin daños reportados." }: { reports: DamageReport[]; empty?: string }) {
  const { font } = useTheme();
  if (reports.length === 0) return <Text style={font.small}>{empty}</Text>;
  return (
    <View style={styles.list}>
      {reports.map((r) => (
        <DamageCard key={r.id} report={r} />
      ))}
    </View>
  );
}

export function DamageCard({ report: r }: { report: DamageReport }) {
  const { font, colors } = useTheme();
  const severe = r.condition === "NO_OPERATIVA";
  return (
    <Card>
      <View style={styles.head}>
        <Ionicons name="alert-circle-outline" size={18} color={severe ? colors.danger : colors.warning} />
        <Text style={[font.body, styles.kind]}>{DAMAGE_KIND_LABEL[r.kind] ?? r.kind}</Text>
        <Text style={[font.small, { color: severe ? colors.danger : colors.textMuted }]}>
          {TOOL_CONDITION_LABEL[r.condition] ?? r.condition}
        </Text>
      </View>
      <Text style={font.small}>
        {formatDateTime(r.occurredAt)} · {r.reportedBy.name}
      </Text>
      <Text style={font.body}>{r.description}</Text>
      {r.notes ? <Text style={font.small}>Observaciones: {r.notes}</Text> : null}
      <Text style={font.small}>
        {r.lifecycleEvent
          ? `Pasó a ${TOOL_STATUS_LABEL[r.lifecycleEvent.toStatus] ?? r.lifecycleEvent.toStatus}`
          : `Estado al reportar: ${(TOOL_STATUS_LABEL[r.toolStatus] ?? r.toolStatus).replace(" (disponible)", "")}`}
        {r.rental ? ` · Alquiler de ${r.rental.lessor}` : ""}
      </Text>
      <PhotoStrip ids={r.photos.map((p) => p.id)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  kind: { flex: 1, fontWeight: "700" },
});
