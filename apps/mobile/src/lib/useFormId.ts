import { randomUUID } from "expo-crypto";
import { useState } from "react";

/**
 * Id del registro que crea el formulario, generado una sola vez al abrirlo. Si el guardado se
 * reintenta (corte de red, doble toque), la API reconoce el mismo id y no crea un duplicado.
 * expo-crypto: Hermes no trae crypto.getRandomValues, y sin él otras librerías de UUID fallan en release.
 */
export function useFormId(): string {
  const [id] = useState(randomUUID);
  return id;
}
