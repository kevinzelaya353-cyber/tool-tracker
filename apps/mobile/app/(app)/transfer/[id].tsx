import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { PhotoStrip } from "@/components/domain/PhotoStrip";
import { Card } from "@/components/ui/Card";
import { ErrorBanner, Loading } from "@/components/ui/Feedback";
import { Screen } from "@/components/ui/Screen";
import { useTransfer } from "@/features/transfers/api";
import { formatDateTime } from "@/lib/format";
import { space, makeStyles, useTheme } from "@/theme";

export default function TransferDetailScreen() {
  const styles = useStyles();
  const { font } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useTransfer(id);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner error={q.error} /></Screen>;
  const t = q.data;

  return (
    <Screen>
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

      {t.photos.length ? (
        <>
          <Text style={font.h2}>Evidencia</Text>
          <PhotoStrip ids={t.photos.map((p) => p.id)} />
        </>
      ) : null}
    </Screen>
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
