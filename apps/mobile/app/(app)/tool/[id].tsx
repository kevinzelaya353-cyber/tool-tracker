import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { MANUAL_EVENT_TYPE, RENTAL_STATUS_LABEL, canReportDamage, type ManualEventType } from "@tt/shared";
import { DamageHistory } from "@/components/domain/DamageHistory";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { Timeline } from "@/components/domain/Timeline";
import { ToolCoverPhoto } from "@/components/domain/ToolCoverPhoto";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDamageReports } from "@/features/damage/api";
import { useToolRentals } from "@/features/rentals/api";
import { useTool, useToolHistory } from "@/features/tools/api";
import { ToolQrCard } from "@/features/tools/ToolQrCard";
import { EVENT_ACTION, formatDate, formatDateUTC, formatMoney } from "@/lib/format";
import { space, makeStyles, useTheme } from "@/theme";

export default function ToolDetailScreen() {
  const styles = useStyles();
  const { font } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const tool = useTool(id);
  const history = useToolHistory(id);
  const damages = useDamageReports(id);
  const rented = tool.data?.ownership === "RENTADA";
  const rentals = useToolRentals(id, rented);

  if (tool.isLoading) return <Loading />;
  if (!tool.data) return <Screen><ErrorBanner error={tool.error} /></Screen>;
  const t = tool.data;
  // La salida más reciente (el historial viene del más nuevo al más antiguo).
  const trip = t.status === "EN_TRANSITO" ? history.data?.find((e) => e.type === "DISPATCH")?.transfer : undefined;

  // En tránsito no tiene ubicación: solo llega confirmando la recepción del traslado.
  const canTransfer = can("transfers:create") && t.availableEvents.includes("TRANSFER") && Boolean(t.currentLocation);
  // Eventos manuales; el daño va por su propio formulario (con tipo, estado físico y hasta 3 fotos).
  const actions = t.availableEvents
    .filter((e): e is ManualEventType => (MANUAL_EVENT_TYPE as readonly string[]).includes(e) && e !== "DAMAGE")
    .filter((e) => (e === "DECOMMISSION" ? can("lifecycle:decommission") : can("lifecycle:create")));
  const canDamage = can("lifecycle:create") && canReportDamage(t.status);
  const activeRental = rentals.data?.find((r) => r.status === "ACTIVO");

  return (
    <Screen>
      <ToolCoverPhoto toolId={t.id} photoId={t.coverPhotoId} canEdit={can("tools:write")} />
      <Card>
        <Text style={styles.code}>{t.code}</Text>
        <Text style={font.title}>
          {t.category.name} {t.brand}
          {t.model ? ` ${t.model}` : ""}
        </Text>
        <StatusBadge status={t.status} />
        {rented ? <Text style={styles.rented}>Herramienta rentada</Text> : null}
        <View style={styles.facts}>
          <Fact label="Ubicación" value={trip ? `En camino a ${trip.toLocation.name}` : (t.currentLocation?.name ?? "—")} />
          <Fact label="A cargo de" value={t.currentCustodian?.name ?? "—"} />
          <Fact label="Serie" value={t.serial || "—"} />
          {rented ? (
            activeRental ? <Fact label="Arrendador" value={activeRental.lessor} /> : null
          ) : (
            <Fact
              label="Compra"
              value={
                t.purchasePrice === undefined
                  ? formatDateUTC(t.purchaseDate)
                  : `${formatDateUTC(t.purchaseDate)} · ${Number(t.purchasePrice) > 0 ? formatMoney(t.purchasePrice) : "Valor no registrado"}`
              }
            />
          )}
          {t.supplier && !rented ? <Fact label="Proveedor" value={t.supplier} /> : null}
        </View>
        {can("tools:write") ? (
          <Button
            title="Editar datos"
            icon="create-outline"
            variant="secondary"
            compact
            onPress={() => router.push({ pathname: "/tool/edit", params: { id: t.id } })}
          />
        ) : null}
      </Card>

      {trip ? (
        <Button title="Ver traslado en camino" icon="car-outline" variant="secondary" onPress={() => router.push(`/transfer/${trip.id}`)} />
      ) : null}

      {canTransfer || actions.length > 0 || canDamage ? (
        <View style={styles.actions}>
          {canTransfer ? (
            <Button
              title="Trasladar"
              icon="swap-horizontal"
              onPress={() =>
                router.push({ pathname: "/transfer/new", params: { toolId: t.id, fromLocationId: t.currentLocation?.id } })
              }
            />
          ) : null}
          {canDamage ? (
            <Button
              title={activeRental ? "Reportar daño / incidencia" : "Reportar daño"}
              icon="alert-circle-outline"
              variant="danger"
              compact
              onPress={() => router.push({ pathname: "/damage/new", params: { toolId: t.id } })}
            />
          ) : null}
          {actions.map((e) => (
            <Button
              key={e}
              title={EVENT_ACTION[e] ?? e}
              variant={e === "DAMAGE" || e === "LOSS" || e === "DECOMMISSION" ? "danger" : "secondary"}
              compact
              onPress={() => router.push({ pathname: "/event/new", params: { toolId: t.id, type: e } })}
            />
          ))}
        </View>
      ) : null}

      {rented ? (
        <>
          <Text style={font.h2}>Alquileres</Text>
          <ErrorBanner error={rentals.error} />
          {activeRental && can("tools:write") ? (
            <Button
              title="Registrar devolución"
              icon="return-up-back-outline"
              onPress={() => router.push({ pathname: "/rental/return", params: { id: activeRental.id } })}
            />
          ) : null}
          {t.status === "DEVUELTA" && can("tools:write") ? (
            <Button
              title="Recibir de nuevo (nuevo alquiler)"
              icon="download-outline"
              onPress={() => router.push({ pathname: "/rental/new", params: { toolId: t.id } })}
            />
          ) : null}
          {(rentals.data ?? []).map((r) => (
            <Card key={r.id} onPress={() => router.push(`/rental/${r.id}`)}>
              <Text style={[font.body, styles.factValue]}>{r.lessor}</Text>
              <Text style={font.small}>
                {formatDate(r.receivedAt)}
                {r.returnedAt ? ` → ${formatDate(r.returnedAt)}` : r.expectedReturnAt ? ` → prevista ${formatDate(r.expectedReturnAt)}` : ""}
                {" · "}
                {RENTAL_STATUS_LABEL[r.status] ?? r.status}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <Text style={font.h2}>Historial de daños</Text>
      <ErrorBanner error={damages.error} />
      {damages.isLoading ? <Loading /> : <DamageHistory reports={damages.data ?? []} />}

      <ToolQrCard label={{ code: t.code, title: `${t.category.name} ${t.brand}${t.model ? ` ${t.model}` : ""}` }} />

      <Text style={font.h2}>Historial</Text>
      <ErrorBanner error={history.error} />
      {history.isLoading ? <Loading /> : <Timeline events={history.data ?? []} />}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { font } = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={font.small}>{label}</Text>
      <Text style={[font.body, styles.factValue]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, letterSpacing: 0.5 },
    facts: { marginTop: space.sm, gap: space.sm },
    fact: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
    factValue: { flexShrink: 1, textAlign: "right", fontWeight: "600" },
    actions: { gap: space.sm },
    rented: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  }),
);
