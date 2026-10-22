import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ITEM_OUTCOME_LABEL, type ReceptionMethod, type TransferPhotosInput } from "@tt/shared";
import { PhotoStrip } from "@/components/domain/PhotoStrip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { RouteMap } from "@/features/maps/RouteMap";
import { useAddTransferPhotos, useTransfer } from "@/features/transfers/api";
import { formatDateTime } from "@/lib/format";
import type { TransferDetail } from "@/types/api";
import { space, makeStyles, useTheme } from "@/theme";

const METHOD_LABEL: Record<ReceptionMethod, string> = {
  SESION: "desde su sesión",
  PIN: "con su PIN en el teléfono del chofer",
  SUPERVISION: "por un supervisor en su nombre",
};

/** Más de esto en camino se resalta: o pasó algo o nadie confirmó la llegada. */
const ALERT_HOURS = 24;

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const formatHours = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`);
const formatMeters = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export default function TransferDetailScreen() {
  const styles = useStyles();
  const { font, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const q = useTransfer(id);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner error={q.error} /></Screen>;
  const t = q.data;
  // Fotos sin etapa (registradas antes de separar entrega/recepción) cuentan como de entrega.
  const delivery = t.photos.filter((p) => p.stage !== "RECEPCION").map((p) => p.id);
  const reception = t.photos.filter((p) => p.stage === "RECEPCION").map((p) => p.id);

  return (
    <Screen>
      <RouteMap
        from={t.fromLocation}
        to={t.toLocation}
        route={t.routeGeometry}
        distanceM={t.routeDistanceM}
        durationS={t.routeDurationS}
      />

      {t.status === "EN_TRANSITO" ? <InTransit t={t} canReceive={can("transfers:receive")} /> : null}

      <Card>
        <Text style={font.h2}>
          {t.fromLocation.name} → {t.toLocation.name}
        </Text>
        <Row label={t.driver ? "Salió" : "Fecha"} value={formatDateTime(t.movedAt)} />
        {t.driver && t.receivedAt ? <Row label="Llegó" value={formatDateTime(t.receivedAt)} /> : null}
        <Row label="Entregó" value={t.deliveredBy.name} />
        {t.driver ? <Row label="Chofer" value={t.driver.name} /> : null}
        <Row label={t.status === "EN_TRANSITO" ? "Debe recibir" : "Recibió"} value={t.receivedBy.name} />
        {t.receptionMethod ? (
          <Text style={font.small}>
            Recepción confirmada {METHOD_LABEL[t.receptionMethod]}
            {t.receptionMethod === "SUPERVISION" && t.receptionBy ? ` (${t.receptionBy.name})` : ""}.
          </Text>
        ) : null}
        <Row label="Vehículo" value={t.vehicle?.plate ?? "—"} />
        <Row label="Registrado por" value={t.createdBy.name} />
        {t.notes ? <Text style={font.body}>{t.notes}</Text> : null}
        {t.receptionNotes ? <Text style={font.body}>Al recibir: {t.receptionNotes}</Text> : null}
      </Card>

      <Text style={font.h2}>Herramientas ({t.items.length})</Text>
      {t.items.map((i) => (
        <Card key={i.id} onPress={() => router.push(`/tool/${i.tool.id}`)}>
          <Text style={styles.code}>{i.tool.code}</Text>
          <Text style={font.body}>
            {i.tool.category.name} · {i.tool.brand} {i.tool.model ?? ""}
          </Text>
          {i.conditionNote ? <Text style={font.small}>Estado: {i.conditionNote}</Text> : null}
          {i.outcome ? (
            <Text style={[font.small, i.outcome !== "RECIBIDA" && { color: colors.danger, fontWeight: "700" }]}>
              {ITEM_OUTCOME_LABEL[i.outcome]}
              {i.receptionNote ? `: ${i.receptionNote}` : ""}
            </Text>
          ) : null}
        </Card>
      ))}

      <Text style={font.h2}>Fotos al entregar</Text>
      {delivery.length ? <PhotoStrip ids={delivery} /> : <Text style={font.small}>Sin fotos.</Text>}
      <PhotoPlace meters={t.photoDistances?.deliveryM} place={t.fromLocation.name} />
      <Text style={font.h2}>Fotos al recibir</Text>
      {reception.length ? <PhotoStrip ids={reception} /> : <Text style={font.small}>Aún no hay fotos de recepción.</Text>}
      <PhotoPlace meters={t.photoDistances?.receptionM} place={t.toLocation.name} />

      {/* En tránsito, las fotos de recepción se toman al confirmar la llegada. */}
      {can("transfers:create") && t.status === "RECIBIDO" ? <AddPhotos transferId={t.id} /> : null}
    </Screen>
  );
}

/** Aviso de traslado en camino con acceso a confirmar la llegada. */
function InTransit({ t, canReceive }: { t: TransferDetail; canReceive: boolean }) {
  const { font, colors } = useTheme();
  const hours = hoursSince(t.movedAt);
  const late = hours > ALERT_HOURS;
  return (
    <Card style={{ backgroundColor: late ? colors.dangerSoft : colors.transitSoft, gap: space.sm }}>
      <Text style={[font.h2, { color: late ? colors.danger : colors.transit }]}>
        En tránsito hace {formatHours(hours)}
      </Text>
      <Text style={font.body}>
        Lo lleva {t.driver?.name ?? "el chofer"}
        {t.vehicle ? ` en ${t.vehicle.plate}` : ""}. Debe recibir {t.receivedBy.name} en {t.toLocation.name}.
      </Text>
      {late ? <Text style={font.small}>Lleva más de un día en camino: confirma con el chofer qué pasó.</Text> : null}
      {canReceive ? (
        <Button
          title="Confirmar llegada"
          icon="checkmark-done-outline"
          onPress={() => router.push({ pathname: "/transfer/receive", params: { id: t.id } })}
        />
      ) : null}
    </Card>
  );
}

/** Dónde se tomaron las fotos respecto a la ubicación (si el teléfono dio la ubicación). */
function PhotoPlace({ meters, place }: { meters?: number | null; place: string }) {
  const { font, colors } = useTheme();
  if (meters == null) return null;
  // Más de 500 m: probablemente no se tomó en el lugar.
  const far = meters > 500;
  return (
    <Text style={[font.small, far && { color: colors.danger, fontWeight: "700" }]}>
      {far ? "⚠ " : "📍 "}Tomada a {formatMeters(meters)} de {place}
    </Text>
  );
}

/** Quien recibe (o entrega) puede sumar fotos después; el resto del traslado no se edita. */
function AddPhotos({ transferId }: { transferId: string }) {
  const { font } = useTheme();
  const add = useAddTransferPhotos(transferId);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<TransferPhotosInput["stage"]>("RECEPCION");
  const [ids, setIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  // Al guardar se remonta el selector para empezar vacío.
  const [round, setRound] = useState(0);
  const onPhotos = useCallback((next: string[], busy: boolean) => {
    setIds(next);
    setUploading(busy);
  }, []);

  if (!open) {
    return <Button title="Agregar fotos" icon="camera-outline" variant="secondary" onPress={() => setOpen(true)} />;
  }

  const save = () =>
    add.mutate(
      { photoIds: ids, stage },
      {
        onSuccess: () => {
          setIds([]);
          setRound((r) => r + 1);
          setOpen(false);
        },
      },
    );

  return (
    <Card style={{ gap: space.md }}>
      <Text style={font.h2}>Agregar fotos</Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Chip label="Al recibir" selected={stage === "RECEPCION"} onPress={() => setStage("RECEPCION")} />
        <Chip label="Al entregar" selected={stage === "ENTREGA"} onPress={() => setStage("ENTREGA")} />
      </View>
      <ErrorBanner error={add.error} />
      <PhotoPicker key={round} label="Fotos" onChange={onPhotos} />
      <Button
        title={uploading ? "Subiendo fotos…" : "Guardar fotos"}
        icon="checkmark"
        disabled={ids.length === 0 || uploading}
        loading={add.isPending}
        onPress={save}
      />
      <Button title="Cancelar" variant="ghost" onPress={() => setOpen(false)} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { font } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={font.small}>{label}</Text>
      <Text style={[font.body, styles.value]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
    value: { fontWeight: "600", flexShrink: 1, textAlign: "right" },
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
  }),
);
