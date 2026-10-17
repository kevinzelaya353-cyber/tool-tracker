import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { notify } from "@/lib/dialogs";
import { TOOL_STATUS_LABEL, resolveTransition } from "@tt/shared";
import { ToolCard } from "@/components/domain/ToolCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField, type CreateOption } from "@/components/ui/SelectField";
import { Stepper } from "@/components/ui/Stepper";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { QrScanner } from "@/features/camera/QrScanner";
import { useCreateLocation, useCreateVehicle, useLocations, useUsers, useVehicles } from "@/features/catalog/api";
import { useToolsAtLocation } from "@/features/tools/api";
import { useCreateTransfer } from "@/features/transfers/api";
import { formatDateTime } from "@/lib/format";
import { radius, space, makeStyles, useTheme } from "@/theme";

const STEPS = ["Ruta", "Herramientas", "Custodia", "Evidencia"];
const NO_VEHICLE = "__none__";

export default function NewTransferScreen() {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const params = useLocalSearchParams<{ fromLocationId?: string; toolId?: string }>();
  const { user, can } = useAuth();
  const locations = useLocations();
  const users = useUsers();
  const vehicles = useVehicles();
  const create = useCreateTransfer();
  const createLocation = useCreateLocation();
  const createVehicle = useCreateVehicle();

  const [step, setStep] = useState(0);
  const [fromId, setFromId] = useState(params.fromLocationId);
  const [toId, setToId] = useState<string>();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(params.toolId ? [params.toolId] : []));
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [deliveredById, setDeliveredById] = useState(user?.id);
  const [receivedById, setReceivedById] = useState<string>();
  const [vehicleId, setVehicleId] = useState(NO_VEHICLE);
  const [movedAt, setMovedAt] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const onPhotos = useCallback((ids: string[], busy: boolean) => {
    setPhotoIds(ids);
    setUploading(busy);
  }, []);

  const from = locations.data?.find((l) => l.id === fromId);
  const to = locations.data?.find((l) => l.id === toId);
  const toolsAtOrigin = useToolsAtLocation(fromId);

  // Solo se ofrecen herramientas que la máquina de estados permite trasladar al destino elegido.
  const eligible = useMemo(
    () =>
      (toolsAtOrigin.data ?? []).filter((t) => (to ? resolveTransition(t.status, "TRANSFER", to.type).ok : false)),
    [toolsAtOrigin.data, to],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? eligible.filter((t) => `${t.code} ${t.brand} ${t.model ?? ""} ${t.category.name}`.toLowerCase().includes(q)) : eligible;
  }, [eligible, search]);
  const selectedTools = eligible.filter((t) => selected.has(t.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onScanned = (code: string) => {
    const tool = (toolsAtOrigin.data ?? []).find((t) => t.code === code);
    if (!tool) {
      void notify("No disponible", `${code} no se encuentra en ${from?.name ?? "el origen"}.`);
    } else if (!eligible.some((t) => t.id === tool.id)) {
      void notify("No se puede trasladar", `${code} está ${TOOL_STATUS_LABEL[tool.status].toLowerCase()}.`);
    } else {
      setSelected((s) => new Set(s).add(tool.id));
    }
    setScanning(false);
  };

  const canNext = [
    !!fromId && !!toId && fromId !== toId,
    selectedTools.length > 0,
    !!deliveredById && !!receivedById && deliveredById !== receivedById,
    !uploading,
  ][step];

  const submit = () =>
    create.mutate(
      {
        fromLocationId: fromId!,
        toLocationId: toId!,
        deliveredById: deliveredById!,
        receivedById: receivedById!,
        vehicleId: vehicleId === NO_VEHICLE ? undefined : vehicleId,
        movedAt: movedAt.toISOString(),
        notes: notes.trim() || undefined,
        items: selectedTools.map((t) => ({ toolId: t.id })),
        photoIds,
      },
      { onSuccess: (t) => router.replace(`/transfer/${t.id}`) },
    );

  if (locations.isLoading) return <Loading />;

  const locationOptions = (locations.data ?? []).map((l) => ({
    value: l.id,
    label: l.name,
    description: l.type === "BODEGA" ? "Bodega" : "Proyecto",
  }));
  // Quien administra catálogos puede registrar un proyecto o vehículo nuevo sin salir del traslado.
  const canCatalog = can("catalog:write");
  const newProject: CreateOption | undefined = canCatalog
    ? {
        noun: "proyecto",
        detailLabel: "Dirección o ubicación (opcional)",
        onCreate: async (name, address) => (await createLocation.mutateAsync({ name, type: "PROYECTO", address })).id,
      }
    : undefined;
  const newVehicle: CreateOption | undefined = canCatalog
    ? {
        noun: "vehículo",
        detailLabel: "Descripción (opcional)",
        onCreate: async (plate, description) => (await createVehicle.mutateAsync({ plate, description })).id,
      }
    : undefined;
  const cancel = () => (router.canGoBack() ? router.back() : router.replace("/transfers"));

  const userOptions = (users.data ?? []).map((u) => ({ value: u.id, label: u.name }));
  const personName = (id?: string) => users.data?.find((u) => u.id === id)?.name ?? "—";

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <View style={styles.flex}>
            {step > 0 ? (
              <Button title="Atrás" variant="secondary" onPress={() => setStep(step - 1)} />
            ) : (
              <Button title="Cancelar" variant="secondary" onPress={cancel} />
            )}
          </View>
          <View style={styles.flex2}>
            {step < STEPS.length - 1 ? (
              <Button title="Siguiente" disabled={!canNext} onPress={() => setStep(step + 1)} />
            ) : (
              <Button
                title={uploading ? "Subiendo fotos…" : "Confirmar traslado"}
                icon="checkmark"
                disabled={!canNext}
                loading={create.isPending}
                onPress={submit}
              />
            )}
          </View>
        </View>
      }
    >
      <Stepper steps={STEPS} current={step} />
      <ErrorBanner error={create.error} />

      {step === 0 ? (
        <>
          <SelectField
            label="Origen"
            value={fromId}
            onChange={(v) => {
              setFromId(v);
              setSelected(new Set());
              if (v === toId) setToId(undefined);
            }}
            options={locationOptions}
            create={newProject}
          />
          <View style={styles.arrow}>
            <Ionicons name="arrow-down" size={22} color={colors.primaryDark} />
          </View>
          <SelectField
            label="Destino"
            value={toId}
            onChange={setToId}
            options={locationOptions.filter((o) => o.value !== fromId)}
            create={newProject}
          />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <View style={styles.searchRow}>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Filtrar herramientas"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
            <Pressable style={styles.scanBtn} onPress={() => setScanning(true)} accessibilityLabel="Escanear QR">
              <Ionicons name="qr-code-outline" size={24} color={colors.onPrimary} />
            </Pressable>
          </View>
          <Text style={font.small}>
            {selectedTools.length} seleccionada(s) de {eligible.length} disponibles en {from?.name}
          </Text>
          <ErrorBanner error={toolsAtOrigin.error} />
          {toolsAtOrigin.isLoading ? (
            <Loading />
          ) : visible.length === 0 ? (
            <EmptyState icon="hammer-outline" title="No hay herramientas disponibles para trasladar" />
          ) : (
            visible.map((t) => <ToolCard key={t.id} tool={t} selected={selected.has(t.id)} onPress={() => toggle(t.id)} />)
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <SelectField label="Entregado por" value={deliveredById} onChange={setDeliveredById} options={userOptions} />
          <SelectField
            label="Recibido por"
            value={receivedById}
            onChange={setReceivedById}
            options={userOptions.filter((o) => o.value !== deliveredById)}
          />
          <SelectField
            label="Vehículo"
            value={vehicleId}
            onChange={setVehicleId}
            options={[
              { value: NO_VEHICLE, label: "Sin vehículo / a pie" },
              ...(vehicles.data ?? []).map((v) => ({ value: v.id, label: v.plate, description: v.description ?? undefined })),
            ]}
            create={newVehicle}
          />
          <DateTimeField label="Fecha y hora del movimiento" value={movedAt} onChange={setMovedAt} />
          <TextField label="Observaciones (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />
        </>
      ) : null}

      {/* Siempre montado para no perder fotos ya subidas al navegar entre pasos. */}
      <View style={step === 3 ? styles.stepVisible : styles.hidden}>
        <Card style={styles.summary}>
          <Text style={font.h2}>
            {from?.name} → {to?.name}
          </Text>
          <Text style={font.body}>
            {selectedTools.length} herramienta(s): {selectedTools.map((t) => t.code).join(", ")}
          </Text>
          <Text style={font.small}>
            Entrega {personName(deliveredById)} · Recibe {personName(receivedById)}
          </Text>
          <Text style={font.small}>
            {formatDateTime(movedAt)}
            {vehicleId !== NO_VEHICLE ? ` · ${vehicles.data?.find((v) => v.id === vehicleId)?.plate ?? ""}` : ""}
          </Text>
        </Card>
        <PhotoPicker label="Fotos del estado de las herramientas" onChange={onPhotos} />
      </View>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <QrScanner onScanned={onScanned} onClose={() => setScanning(false)} />
      </Modal>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    footer: { flexDirection: "row", gap: space.md },
    flex: { flex: 1 },
    flex2: { flex: 2 },
    arrow: { alignItems: "center" },
    searchRow: { flexDirection: "row", gap: space.sm },
    search: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      minHeight: 48,
    },
    input: { flex: 1, fontSize: 15, color: colors.text },
    scanBtn: { width: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    stepVisible: { gap: space.lg },
    hidden: { display: "none" },
    summary: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  }),
);
