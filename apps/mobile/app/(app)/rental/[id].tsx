import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RENTAL_STATUS_LABEL, TOOL_CONDITION_LABEL, type ToolCondition } from "@tt/shared";
import { DamageCard } from "@/components/domain/DamageHistory";
import { PhotoStrip } from "@/components/domain/PhotoStrip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRental } from "@/features/rentals/api";
import { EVENT_LABEL, formatDate, formatDateTime } from "@/lib/format";
import type { DamageReport, RentalDetail } from "@/types/api";
import { space, makeStyles, useTheme } from "@/theme";

type Icon = ComponentProps<typeof Ionicons>["name"];

/** Durante el alquiler: incidencias y otros movimientos de la herramienta, en orden cronológico. */
type Middle = { at: string; key: string; incident?: DamageReport; event?: RentalDetail["events"][number] };

/**
 * Un período de alquiler como línea de tiempo: recepción → incidencias y movimientos → devolución.
 * Se puede consultar completo también después de devolver la herramienta.
 */
export default function RentalDetailScreen() {
  const styles = useStyles();
  const { font, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const rental = useRental(id);

  if (rental.isLoading) return <Loading />;
  if (!rental.data) return <Screen><ErrorBanner error={rental.error} /></Screen>;
  const r = rental.data;
  const active = r.status === "ACTIVO";
  const overdue = active && !!r.expectedReturnAt && new Date(r.expectedReturnAt).getTime() < Date.now();
  const receptionPhotos = r.photos.filter((p) => p.stage === "RECEPCION").map((p) => p.id);
  const returnPhotos = r.photos.filter((p) => p.stage === "DEVOLUCION").map((p) => p.id);
  const middle: Middle[] = [
    ...r.incidents.map((i) => ({ at: i.occurredAt, key: `i${i.id}`, incident: i })),
    ...r.events.map((e) => ({ at: e.occurredAt, key: `e${e.id}`, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Screen>
      <Card onPress={() => router.push(`/tool/${r.tool.id}`)}>
        <Text style={styles.code}>{r.tool.code}</Text>
        <Text style={font.title}>
          {r.tool.category.name} {r.tool.brand}
          {r.tool.model ? ` ${r.tool.model}` : ""}
        </Text>
        <Text style={font.body}>Arrendador: {r.lessor}</Text>
        <Text style={[font.small, overdue && { color: colors.danger, fontWeight: "700" }]}>
          {RENTAL_STATUS_LABEL[r.status] ?? r.status}
          {active && r.expectedReturnAt ? ` · devolución prevista ${formatDate(r.expectedReturnAt)}` : ""}
          {overdue ? " (vencida)" : ""}
        </Text>
        {r.notes ? <Text style={font.small}>{r.notes}</Text> : null}
      </Card>

      {active ? (
        <View style={styles.actions}>
          {can("lifecycle:create") ? (
            <Button
              title="Registrar incidencia"
              icon="alert-circle-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: "/damage/new", params: { toolId: r.tool.id } })}
            />
          ) : null}
          {can("tools:write") ? (
            <Button
              title="Registrar devolución"
              icon="return-up-back-outline"
              onPress={() => router.push({ pathname: "/rental/return", params: { id: r.id } })}
            />
          ) : null}
        </View>
      ) : null}

      <Text style={font.h2}>Línea de tiempo</Text>
      <View>
        <Step icon="download-outline" title="Recepción" tone={colors.success} last={false}>
          <Text style={font.small}>
            {formatDateTime(r.receivedAt)} · Recibió {r.receivedBy.name} · {r.location.name}
          </Text>
          <Condition label="Estado al recibirla" value={r.receptionCondition} />
          {r.receptionDescription ? <Text style={font.body}>{r.receptionDescription}</Text> : null}
          {r.receptionNotes ? <Text style={font.small}>Observaciones: {r.receptionNotes}</Text> : null}
          <PhotoStrip ids={receptionPhotos} />
        </Step>

        {middle.map((m) => (
          <Step
            key={m.key}
            icon={m.incident ? "alert-circle-outline" : "swap-horizontal"}
            title={m.incident ? "Incidencia" : (EVENT_LABEL[m.event!.type] ?? m.event!.type)}
            tone={m.incident ? colors.warning : colors.info}
            last={false}
          >
            {m.incident ? (
              <DamageCard report={m.incident} />
            ) : (
              <>
                <Text style={font.small}>
                  {formatDateTime(m.event!.occurredAt)} · {m.event!.reportedBy.name}
                </Text>
                {m.event!.transfer ? (
                  <Text style={font.body}>
                    {m.event!.transfer.fromLocation.name} → {m.event!.transfer.toLocation.name}
                  </Text>
                ) : null}
                {m.event!.description ? <Text style={font.body}>{m.event!.description}</Text> : null}
              </>
            )}
          </Step>
        ))}

        {r.returnedAt ? (
          <Step icon="return-up-back-outline" title="Devolución" tone={colors.textMuted} last>
            <Text style={font.small}>
              {formatDateTime(r.returnedAt)} · Registró {r.returnedBy?.name ?? "—"}
            </Text>
            {r.returnCondition ? <Condition label="Estado al devolverla" value={r.returnCondition} /> : null}
            {r.returnDifferences ? <Text style={font.body}>Diferencias: {r.returnDifferences}</Text> : null}
            {r.returnDescription ? <Text style={font.body}>{r.returnDescription}</Text> : null}
            {r.returnNotes ? <Text style={font.small}>Observaciones: {r.returnNotes}</Text> : null}
            <PhotoStrip ids={returnPhotos} />
          </Step>
        ) : (
          <Step icon="time-outline" title="Pendiente de devolución" tone={overdue ? colors.danger : colors.textMuted} last>
            <Text style={font.small}>{r.expectedReturnAt ? `Prevista: ${formatDate(r.expectedReturnAt)}` : "Sin fecha prevista"}</Text>
          </Step>
        )}
      </View>
    </Screen>
  );
}

function Condition({ label, value }: { label: string; value: ToolCondition }) {
  const { font, colors } = useTheme();
  return (
    <Text style={[font.body, { fontWeight: "600", color: value === "NO_OPERATIVA" ? colors.danger : colors.text }]}>
      {label}: {TOOL_CONDITION_LABEL[value] ?? value}
    </Text>
  );
}

function Step({ icon, title, tone, last, children }: { icon: Icon; title: string; tone: string; last: boolean; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.dot, { borderColor: tone }]}>
          <Ionicons name={icon} size={14} color={tone} />
        </View>
        {last ? null : <View style={styles.line} />}
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
    actions: { gap: space.sm },
    row: { flexDirection: "row", gap: space.md },
    rail: { alignItems: "center", width: 28 },
    dot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
    body: { flex: 1, paddingBottom: space.lg, gap: 4 },
    title: { fontSize: 15, fontWeight: "700", color: colors.text },
  }),
);
