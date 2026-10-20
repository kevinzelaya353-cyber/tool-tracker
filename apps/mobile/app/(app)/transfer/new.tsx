import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { notify } from "@/lib/dialogs";
import { TOOL_STATUS_LABEL, resolveTransition } from "@tt/shared";
import { ToolCard } from "@/components/domain/ToolCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { SelectField, type CreateOption } from "@/components/ui/SelectField";
import { Stepper } from "@/components/ui/Stepper";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { PhotoPicker } from "@/features/camera/PhotoPicker";
import { usePhotoUrlMap } from "@/features/media/api";
import { QrScanner } from "@/features/camera/QrScanner";
import {
  useCreateLocation,
  useCreatePerson,
  useCreateVehicle,
  useLocations,
  useUsers,
  useVehicles,
} from "@/features/catalog/api";
import { useToolsAtLocation } from "@/features/tools/api";
import { RouteMap } from "@/features/maps/RouteMap";
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
  const createPerson = useCreatePerson();

  const [step, setStep] = useState(0);
  const [fromId, setFromId] = useState(params.fromLocationId);
  const [toId, setToId] = useState<string>();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(params.toolId ? [params.toolId] : []));
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const isDriver = user?.role === "CHOFER";
  // Con chofer las herramientas quedan en tránsito hasta que quien recibe confirma la llegada.
  // Si quien registra es chofer, por defecto las lleva él; quien entrega es la persona del origen.
  const [withDriver, setWithDriver] = useState(isDriver);
  const [driverId, setDriverId] = useState<string | undefined>(isDriver ? user?.id : undefined);
  const [deliveredById, setDeliveredById] = useState(isDriver ? undefined : user?.id);
  const [receivedById, setReceivedById] = useState<string>();
  const [vehicleId, setVehicleId] = useState(NO_VEHICLE);
  const [movedAt, setMovedAt] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [receptionPhotoIds, setReceptionPhotoIds] = useState<string[]>([]);
  const [uploadingDelivery, setUploadingDelivery] = useState(false);
  const [uploadingReception, setUploadingReception] = useState(false);
  const uploading = uploadingDelivery || uploadingReception;
  const onDeliveryPhotos = useCallback((ids: string[], busy: boolean) => {
    setPhotoIds(ids);
    setUploadingDelivery(busy);
  }, []);
  const onReceptionPhotos = useCallback((ids: string[], busy: boolean) => {
    setReceptionPhotoIds(ids);
    setUploadingReception(busy);
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
  // Sobre todas las elegibles (no las filtradas): buscar no vuelve a pedir las miniaturas.
  const thumbs = usePhotoUrlMap(eligible.map((t) => t.coverPhotoId));

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

  const custodyOk =
    !!deliveredById &&
    !!receivedById &&
    deliveredById !== receivedById &&
    (!withDriver || (!!driverId && driverId !== receivedById));
  const canNext = [!!fromId && !!toId && fromId !== toId, selectedTools.length > 0, custodyOk, !uploading][step];

  const submit = () =>
    create.mutate(
      {
        fromLocationId: fromId!,
        toLocationId: toId!,
        deliveredById: deliveredById!,
        receivedById: receivedById!,
        driverId: withDriver ? driverId : undefined,
        vehicleId: vehicleId === NO_VEHICLE ? undefined : vehicleId,
        movedAt: movedAt.toISOString(),
        notes: notes.trim() || undefined,
        items: selectedTools.map((t) => ({ toolId: t.id })),
        photoIds,
        // Con chofer, las fotos de recepción se toman al confirmar la llegada.
        receptionPhotoIds: withDriver ? [] : receptionPhotoIds,
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
  const newPerson: CreateOption | undefined = canCatalog
    ? { noun: "persona", onCreate: async (name) => (await createPerson.mutateAsync(name)).id }
    : undefined;
  const cancel =() => (router.canGoBack() ? router.back() : router.replace("/transfers"));

  const userOptions = (users.data ?? []).map((u) => ({ value: u.id, label: u.name }));
  // Choferes primero en la lista de quién lleva las herramientas.
  const driverOptions = [...(users.data ?? [])]
    .sort((a, b) => Number(b.role === "CHOFER") - Number(a.role === "CHOFER"))
    .map((u) => ({ value: u.id, label: u.name, description: u.role === "CHOFER" ? "Chofer" : undefined }));
  const personName = (id?: string) => users.data?.find((u) => u.id === id)?.name ?? "—";
  const pickDriver = (id: string) => {
    setDriverId(id);
    if (id === receivedById) setReceivedById(undefined);
    // Su vehículo habitual, si tiene uno asignado.
    const vehicle = users.data?.find((u) => u.id === id)?.defaultVehicleId;
    if (vehicle && vehicles.data?.some((v) => v.id === vehicle)) setVehicleId(vehicle);
  };

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
                title={uploading ? "Subiendo fotos…" : withDriver ? "Registrar salida" : "Confirmar traslado"}
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
            visible.map((t) => (
              <ToolCard
                key={t.id}
                tool={t}
                selected={selected.has(t.id)}
                thumbUrl={t.coverPhotoId ? thumbs[t.coverPhotoId] : undefined}
                onPress={() => toggle(t.id)}
              />
            ))
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <View style={styles.mode}>
            <Text style={font.label}>¿Cómo viaja?</Text>
            <View style={styles.modeRow}>
              <Chip label="Lo lleva un chofer" selected={withDriver} onPress={() => setWithDriver(true)} />
              <Chip label="Entrega directa" selected={!withDriver} onPress={() => setWithDriver(false)} />
            </View>
            <Text style={font.small}>
              {withDriver
                ? "Quedan en tránsito a cargo del chofer hasta que quien recibe confirme la llegada."
                : "Llegan al destino en el acto: quien entrega y quien recibe están juntos."}
            </Text>
          </View>
          {withDriver ? (
            <SelectField label="Chofer (quien las lleva)" value={driverId} onChange={pickDriver} options={driverOptions} />
          ) : null}
          <SelectField
            label={withDriver ? "Entregado por (en el origen)" : "Entregado por"}
            value={deliveredById}
            onChange={(v) => {
              setDeliveredById(v);
              if (v === receivedById) setReceivedById(undefined);
            }}
            options={userOptions}
            create={newPerson}
          />
          <SelectField
            label={withDriver ? "Quién recibirá en el destino" : "Recibido por"}
            value={receivedById}
            onChange={setReceivedById}
            options={userOptions.filter((o) => o.value !== deliveredById && (!withDriver || o.value !== driverId))}
            create={newPerson}
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
          <DateTimeField label={withDriver ? "Fecha y hora de salida" : "Fecha y hora del movimiento"} value={movedAt} onChange={setMovedAt} />
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
            Entrega {personName(deliveredById)}
            {withDriver ? ` · Lleva ${personName(driverId)}` : ""} · Recibe {personName(receivedById)}
          </Text>
          <Text style={font.small}>
            {formatDateTime(movedAt)}
            {vehicleId !== NO_VEHICLE ? ` · ${vehicles.data?.find((v) => v.id === vehicleId)?.plate ?? ""}` : ""}
          </Text>
        </Card>
        {from && to ? <RouteMap from={from} to={to} height={200} /> : null}
        <PhotoPicker
          label="Fotos al entregar"
          hint="Estado de las herramientas al salir del origen."
          onChange={onDeliveryPhotos}
        />
        {withDriver ? null : (
          <PhotoPicker
            label="Fotos al recibir (opcional)"
            hint="Si quien recibe aún no las tiene, puede agregarlas después desde el detalle del traslado."
            onChange={onReceptionPhotos}
          />
        )}
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
    mode: { gap: space.xs },
    modeRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
    hidden: { display: "none" },
    summary: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  }),
);
