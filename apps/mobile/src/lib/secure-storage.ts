import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * En el teléfono: llavero del sistema (Keychain / Keystore).
 * En web (solo desarrollo): localStorage, que SecureStore no soporta. Es menos seguro
 * (accesible por cualquier script de la página); no usar la versión web en producción.
 */
const isWeb = Platform.OS === "web";

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!isWeb) return SecureStore.getItemAsync(key);
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!isWeb) return SecureStore.setItemAsync(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // modo privado / almacenamiento bloqueado: la sesión dura solo mientras la pestaña esté abierta
    }
  },
  async deleteItem(key: string): Promise<void> {
    if (!isWeb) return SecureStore.deleteItemAsync(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignorar
    }
  },
};
