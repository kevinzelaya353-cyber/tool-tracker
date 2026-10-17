import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useTransferMap } from "@/features/transfers/api";
import { radius, makeStyles, useTheme } from "@/theme";

/** Miniatura del mapa con la ruta del traslado (imagen generada por la API, ligera para listas). */
export function TransferMapThumb({ transferId, width = 132 }: { transferId: string; width?: number }) {
  const styles = useStyles();
  const { colors, font } = useTheme();
  const map = useTransferMap(transferId);
  const size = { width, height: Math.round((width * 2) / 3) }; // la imagen es 3:2

  if (map.isLoading) {
    return (
      <View style={[styles.box, size]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!map.data) {
    return (
      <View style={[styles.box, size]} accessibilityLabel="Sin mapa">
        <Ionicons name="map-outline" size={22} color={colors.textMuted} />
        <Text style={[font.small, styles.hint]}>Sin puntos en el mapa</Text>
      </View>
    );
  }
  return <Image source={{ uri: map.data }} style={[styles.img, size]} accessibilityLabel="Mapa de la ruta" />;
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    box: {
      borderRadius: radius.md,
      backgroundColor: colors.neutralSoft,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      padding: 4,
    },
    hint: { textAlign: "center", fontSize: 11 },
    img: { borderRadius: radius.md, backgroundColor: colors.neutralSoft },
  }),
);
