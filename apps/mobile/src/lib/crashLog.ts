import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/**
 * Último error grave de la app, guardado en el teléfono. En una APK de producción un error de
 * JavaScript no capturado cierra la app sin dejar rastro visible; así, al volver a abrirla se
 * puede ver qué pasó (y reportarlo) sin conectar el teléfono a una computadora.
 */
export interface CrashRecord {
  at: string;
  message: string;
  stack?: string;
  /** Pantalla/componente donde ocurrió (si lo capturó un ErrorBoundary). */
  where?: string;
  fatal: boolean;
  version: string;
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(handler: GlobalHandler): void;
}

const crashFile = () => new File(Paths.document, "ultimo-error.json");

/** Síncrono a propósito: tras un error fatal el proceso termina enseguida. */
export function recordCrash(error: unknown, opts: { fatal: boolean; where?: string }) {
  if (Platform.OS === "web") return;
  try {
    const e = error instanceof Error ? error : new Error(String(error));
    const record: CrashRecord = {
      at: new Date().toISOString(),
      message: e.message.slice(0, 1000),
      stack: e.stack?.slice(0, 4000),
      where: opts.where?.slice(0, 2000),
      fatal: opts.fatal,
      version: `${Constants.expoConfig?.version ?? "?"} (${Platform.OS})`,
    };
    crashFile().write(JSON.stringify(record));
  } catch {
    // nunca empeorar un error mientras se registra
  }
}

let installed = false;

/** Envuelve el manejador global de React Native: registra el error y deja que siga su curso normal. */
export function installCrashRecorder() {
  if (installed || Platform.OS === "web") return;
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!eu) return;
  installed = true;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => {
    if (isFatal) recordCrash(error, { fatal: true });
    previous(error, isFatal);
  });
}

/** Devuelve (y borra) el error guardado de la sesión anterior, si lo hay. */
export function takeLastCrash(): CrashRecord | null {
  if (Platform.OS === "web") return null;
  try {
    const f = crashFile();
    if (!f.exists) return null;
    const record = JSON.parse(f.textSync()) as CrashRecord;
    f.delete();
    return record;
  } catch {
    return null;
  }
}
