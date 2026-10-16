import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { EventType } from "@tt/shared";
import { EVENT_LABEL, formatDateTime, formatMoney } from "@/lib/format";
import type { HistoryEvent } from "@/types/api";
import { space, makeStyles, useTheme } from "@/theme";
import { PhotoStrip } from "./PhotoStrip";

const ICON: Record<EventType, ComponentProps<typeof Ionicons>["name"]> = {
  PURCHASE: "cart-outline",
  TRANSFER: "swap-horizontal",
  MAINTENANCE_START: "build-outline",
  MAINTENANCE_END: "checkmark-done-outline",
  DAMAGE: "alert-circle-outline",
  LOSS: "help-circle-outline",
  RECOVERY: "refresh-circle-outline",
  DECOMMISSION: "trash-outline",
};

/** Cadena de custodia + ciclo de vida, del evento más reciente al más antiguo. */
export function Timeline({ events }: { events: HistoryEvent[] }) {
  const styles = useStyles();
  const { font, statusColors } = useTheme();
  return (
    <View>
      {events.map((e, i) => {
        const c = statusColors[e.toStatus];
        const photos = [...e.photos, ...(e.transfer?.photos ?? [])].map((p) => p.id);
        return (
          <View key={e.id} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: c.bg, borderColor: c.fg }]}>
                <Ionicons name={ICON[e.type]} size={14} color={c.fg} />
              </View>
              {i < events.length - 1 ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{EVENT_LABEL[e.type]}</Text>
              <Text style={font.small}>
                {formatDateTime(e.occurredAt)} · {e.reportedBy.name}
              </Text>

              {e.transfer ? (
                <View style={styles.detail}>
                  <Text style={font.body}>
                    {e.transfer.fromLocation.name} → {e.transfer.toLocation.name}
                  </Text>
                  <Text style={font.small}>
                    Entregó {e.transfer.deliveredBy.name} · Recibió {e.transfer.receivedBy.name}
                    {e.transfer.vehicle ? ` · Vehículo ${e.transfer.vehicle.plate}` : ""}
                  </Text>
                </View>
              ) : e.location && e.type !== "PURCHASE" ? (
                <Text style={font.small}>Ubicación: {e.location.name}</Text>
              ) : null}

              {e.cost ? <Text style={font.small}>Costo: {formatMoney(e.cost)}</Text> : null}
              {e.description ? <Text style={font.body}>{e.description}</Text> : null}
              <PhotoStrip ids={photos} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: space.md },
    rail: { alignItems: "center", width: 28 },
    dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
    body: { flex: 1, paddingBottom: space.lg, gap: 4 },
    title: { fontSize: 15, fontWeight: "700", color: colors.text },
    detail: { gap: 2 },
  }),
);
