import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  style?: StyleProp<ViewStyle>;
  /** "light" sobre fondos oscuros (cámara, visor de fotos): íconos blancos en la barra de estado. */
  statusBar?: "light" | "dark";
  children: ReactNode;
}

/**
 * Área segura para el contenido de un Modal. En Android (de borde a borde, SDK 57) el SafeAreaView
 * dentro de un Modal no recibe los márgenes y el contenido quedaba debajo de la barra de
 * notificaciones; los márgenes del contexto (useSafeAreaInsets) sí llegan al Modal.
 */
export function ModalSafeArea({ style, statusBar, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }, style]}>
      {statusBar ? <StatusBar style={statusBar} /> : null}
      {children}
    </View>
  );
}
