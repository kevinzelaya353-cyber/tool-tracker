import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ITEM_OUTCOME, ITEM_OUTCOME_LABEL, type ItemOutcome } from "@tt/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { useReceiveTransfer, useTransfer } from "@/features/transfers/api";
import { makeStyles, space, useTheme } from "@/theme";

type Check = { outcome: ItemOutcome; note: string };

/**
 * Confirmar la llegada de un traslado con chofer: resultado por herramienta, fotos y quién confirma.
 * Si quien tiene el teléfono no es quien recibe (p. ej. el chofer), quien recibe escribe aquí su PIN.
 */
export default function ReceiveTransferScreen() {
  const styles = useStyles();
  const { font, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const q = useTransfer(id);
  const receive = useReceiveTransfer(id);

  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [receivedAt, setReceivedAt] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [pin, setPin] = useState("");
  const [asSupervisor, setAsSupervisor] = useState(false);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const onPhotos = useCallback((ids: string[], busy: boolean) => {
    setPhotoIds(ids);
    setUploading(busy);
  }, []);

  if (q.isLoading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner error={q.error} /></Screen>;
  const t = q.data;
  if (t.status !== "EN_TRANSITO") {
    return (
      <Screen>
        <Text style={font.body}>Este traslado ya fue recibido.</Text>
        <Button title="Ver traslado" onPress={() => router.replace(`/transfer/${t.id}`)} />
      </Screen>
    );
  }

  const check = (toolId: string): Check => checks[toolId] ?? { outcome: "RECIBIDA", note: "" };
  const setCheck = (toolId: string, patch: Partial<Check>) =>
    setChecks((all) => ({ ...all, [toolId]: { ...check(toolId), ...patch } }));

  const isReceiver = user?.id === t.receivedBy.id;
  const canOverride = can("transfers:override");
  const usePin = !isReceiver && !asSupervisor;
  const missingNotes = t.items.some((i) => check(i.tool.id).outcome !== "RECIBIDA" && !check(i.tool.id).note.trim());
  const problems = t.items.filter((i) => check(i.tool.id).outcome !== "RECIBIDA").length;
  const ready = !uploading && !missingNotes && (!usePin || /^\d{4}$/.test(pin));

  const submit = () =>
    receive.mutate(
      {
        receivedAt: receivedAt.toISOString(),
        items: t.items.map((i) => {
          const c = check(i.tool.id);
          return { toolId: i.tool.id, outcome: c.outcome, note: c.note.trim() || undefined };
        }),
        photoIds,
        pin: usePin ? pin : undefined,
        notes: notes.trim() || undefined,
      },
      {
        // El PIN no se guarda en pantalla: si falló, se vuelve a escribir.
        onError: () => setPin(""),
        onSuccess: () => router.replace(`/transfer/${t.id}`),
      },
    );

  return (
    <Screen
      footer={
        <Button
          title={uploading ? "Subiendo fotos…" : problems ? `Confirmar (${problems} con problema)` : "Confirmar llegada"}
          icon="checkmark-done"
          variant={problems ? "danger" : "primary"}
          disabled={!ready}
          loading={receive.isPending}
          onPress={submit}
        />
      }
    >
      <Card style={styles.summary}>
        <Text style={font.h2}>
          {t.fromLocation.name} → {t.toLocation.name}
        </Text>
        <Text style={font.small}>
          Lo trae {t.driver?.name ?? "el chofer"} · Recibe {t.receivedBy.name}
        </Text>
      </Card>
      <ErrorBanner error={receive.error} />

      <Text style={font.h2}>¿Llegó todo? ({t.items.length})</Text>
      {t.items.map((i) => {
        const c = check(i.tool.id);
        return (
          <Card key={i.id} style={styles.item}>
            <Text style={styles.code}>{i.tool.code}</Text>
            <Text style={font.body}>
              {i.tool.category.name} · {i.tool.brand} {i.tool.model ?? ""}
            </Text>
            <View style={styles.row}>
              {ITEM_OUTCOME.map((o) => (
                <Chip key={o} label={ITEM_OUTCOME_LABEL[o]} selected={c.outcome === o} onPress={() => setCheck(i.tool.id, { outcome: o })} />
              ))}
            </View>
            {c.outcome !== "RECIBIDA" ? (
              <TextField
                label={c.outcome === "DANADA" ? "¿Qué daño tiene?" : "¿Qué pasó?"}
                value={c.note}
                onChangeText={(note) => setCheck(i.tool.id, { note })}
                maxLength={250}
                error={c.note.trim() ? undefined : "Obligatorio"}
              />
            ) : null}
          </Card>
        );
      })}

      <DateTimeField label="Fecha y hora de llegada" value={receivedAt} onChange={setReceivedAt} />
      <PhotoPicker label="Fotos al recibir" hint="Estado en que llegaron las herramientas." onChange={onPhotos} />
      <TextField label="Observaciones (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />

      {isReceiver ? (
        <Text style={font.small}>Confirmas como {t.receivedBy.name}.</Text>
      ) : (
        <Card style={{ ...styles.item, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
          <Text style={font.h2}>¿Quién confirma?</Text>
          {canOverride ? (
            <View style={styles.row}>
              <Chip label={`PIN de ${t.receivedBy.name}`} selected={!asSupervisor} onPress={() => setAsSupervisor(false)} />
              <Chip label="Confirmo como supervisor" selected={asSupervisor} onPress={() => setAsSupervisor(true)} />
            </View>
          ) : null}
          {usePin ? (
            <TextField
              label={`PIN de ${t.receivedBy.name}`}
              hint={`Pásale el teléfono a ${t.receivedBy.name} para que lo escriba. 5 intentos fallidos bloquean su cuenta.`}
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
          ) : (
            <Text style={font.small}>Quedará registrado que confirmaste en nombre de {t.receivedBy.name}.</Text>
          )}
        </Card>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    summary: { borderLeftWidth: 4, borderLeftColor: colors.transit },
    item: { gap: space.sm },
    row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    code: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
  }),
);
