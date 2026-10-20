import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useState } from "react";
import { confirmAsync } from "./dialogs";

/**
 * Con datos escritos sin guardar, salir de la pantalla (atrás, botón de Android, inicio) pide
 * confirmación. Devuelve `leave(go)` para salir tras guardar sin preguntar: primero se apaga
 * la protección y en el siguiente render se navega.
 */
export function useConfirmDiscard(dirty: boolean) {
  const navigation = useNavigation();
  const [pending, setPending] = useState<(() => void) | null>(null);

  usePreventRemove(dirty && !pending, ({ data }) => {
    void confirmAsync("¿Salir sin guardar?", "Perderás todos los datos que ya escribiste.", {
      confirmText: "Salir",
      destructive: true,
    }).then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });

  useEffect(() => {
    pending?.();
  }, [pending]);

  return (go: () => void) => setPending(() => go);
}
