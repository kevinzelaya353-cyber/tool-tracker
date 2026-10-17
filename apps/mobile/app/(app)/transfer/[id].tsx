import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PhotoStage } from "@tt/shared";
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
import { space, makeStyles, useTheme } from "@/theme";

export default function TransferDetailScreen() {
  const styles = useStyles();
  const { font } = useTheme();
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

      <Card>
        <Text style={font.h2}>
          {t.fromLocation.name} → {t.toLocation.name}
        </Text>
        <Row label="Fecha" value={formatDateTime(t.movedAt)} />
        <Row label="Entregó" value={t.deliveredBy.name} />
        <Row label="Recibió" value={t.receivedBy.name} />
        <Row label="Vehículo" value={t.vehicle?.plate ?? "—"} />
        <Row label="Registrado por" value={t.createdBy.name} />
        {t.notes ? <Text style={font.body}>{t.notes}</Text> : null}
      </Card>

      <Text style={font.h2}>Herramientas ({t.items.length})</Text>
      {t.items.map((i) => (
        <Card key={i.id} onPress={() => router.push(`/tool/${i.tool.id}`)}>
          <Text style={styles.code}>{i.tool.code}</Text>
          <Text style={font.body}>
            {i.tool.category.name} · {i.tool.brand} {i.tool.model ?? ""}
          </Text>
          {i.conditionNote ? <Text style={font.small}>Estado: {i.conditionNote}</Text> : null}
        </Card>
      ))}

      <Text style={font.h2}>Fotos al entregar</Text>
      {delivery.length ? <PhotoStrip ids={delivery} /> : <Text style={font.small}>Sin fotos.</Text>}
      <Text style={font.h2}>Fotos al recibir</Text>
      {reception.length ? <PhotoStrip ids={reception} /> : <Text style={font.small}>Aún no hay fotos de recepción.</Text>}

      {can("transfers:create") ? <AddPhotos transferId={t.id} /> : null}
    </Screen>
  );
}

/** Quien recibe (o entrega) puede sumar fotos después; el resto del traslado no se edita. */
function AddPhotos({ transferId }: { transferId: string }) {
  const { font } = useTheme();
  const add = useAddTransferPhotos(transferId);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<PhotoStage>("RECEPCION");
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
