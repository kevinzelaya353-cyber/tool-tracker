import { Alert, Platform } from "react-native";

/**
 * Diálogos que funcionan en teléfono y en web. En react-native-web, Alert.alert con
 * botones no muestra nada, así que en el navegador se usan los diálogos nativos.
 */

export function notify(title: string, message?: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return Promise.resolve();
  }
  return new Promise((resolve) => Alert.alert(title, message, [{ text: "OK", onPress: () => resolve() }]));
}

export function confirmAsync(
  title: string,
  message: string,
  opts: { confirmText?: string; destructive?: boolean } = {},
): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: opts.confirmText ?? "Aceptar", style: opts.destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
