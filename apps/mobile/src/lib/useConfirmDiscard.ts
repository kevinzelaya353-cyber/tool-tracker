import { useNavigation } from "expo-router";
import { useEffect, useRef } from "react";
import { confirmAsync } from "./dialogs";

/**
 * Con datos escritos sin guardar, salir de la pantalla (atrás, botón de Android, inicio) pide
 * confirmación. Devuelve `leave(go)` para salir tras guardar sin preguntar.
 *
 * Se escucha `beforeRemove` en vez de usar `usePreventRemove`: este cambia una propiedad de la
 * pantalla nativa y, al apagarlo y navegar enseguida (justo al guardar), la APK de Android se
 * cerraba. Con un ref la protección se apaga sin tocar la pantalla nativa.
 */
export function useConfirmDiscard(dirty: boolean) {
  const navigation = useNavigation();
  const guard = useRef(dirty);

  useEffect(() => {
    guard.current = dirty;
  }, [dirty]);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (!guard.current) return;
        e.preventDefault();
        void confirmAsync("¿Salir sin guardar?", "Perderás todos los datos que ya escribiste.", {
          confirmText: "Salir",
          destructive: true,
        }).then((ok) => {
          if (!ok) return;
          guard.current = false;
          navigation.dispatch(e.data.action);
        });
      }),
    [navigation],
  );

  return (go: () => void) => {
    guard.current = false;
    go();
  };
}
