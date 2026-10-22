import { createContext, useContext } from "react";
import type { ToolStatus } from "@tt/shared";

export type ColorScheme = "light" | "dark";

const lightColors = {
  primary: "#F59E0B", // ámbar: identidad de obra/construcción
  primaryDark: "#B45309", // acento sobre superficie (enlaces, códigos, iconos activos)
  primarySoft: "#FEF3C7",
  onPrimary: "#1F1300", // texto/icono sobre fondo primary
  bg: "#F5F6F8",
  surface: "#FFFFFF",
  text: "#0F172A",
  textMuted: "#64748B",
  border: "#E2E8F0",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  onDanger: "#FFFFFF",
  success: "#16A34A",
  successSoft: "#DCFCE7",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  lost: "#7C3AED",
  lostSoft: "#EDE9FE",
  transit: "#0E7490", // turquesa: va en el camión
  transitSoft: "#CFFAFE",
  neutralSoft: "#F1F5F9",
  overlay: "rgba(15, 23, 42, 0.55)",
};

export type Colors = typeof lightColors;

/** Misma identidad sobre pizarra oscura: acentos un paso más claros para mantener el contraste. */
const darkColors: Colors = {
  primary: "#F59E0B",
  primaryDark: "#FBBF24",
  primarySoft: "#3A2A0C",
  onPrimary: "#1F1300",
  bg: "#0F172A",
  surface: "#1E293B",
  text: "#F1F5F9",
  textMuted: "#94A3B8",
  border: "#334155",
  danger: "#F87171",
  dangerSoft: "#3B1A1F",
  onDanger: "#2A0A0A",
  success: "#4ADE80",
  successSoft: "#12301F",
  info: "#60A5FA",
  infoSoft: "#172A4D",
  warning: "#FBBF24",
  warningSoft: "#3A2A0C",
  lost: "#A78BFA",
  lostSoft: "#2A1E4F",
  transit: "#22D3EE",
  transitSoft: "#123A44",
  neutralSoft: "#283548",
  overlay: "rgba(0, 0, 0, 0.6)",
};

/**
 * Tokens de gráficas: slots 1–4 de la paleta categórica de referencia y tinta de ejes/rejilla.
 * Orden fijo: Compras siempre azul, Mantenimiento siempre naranja. Cada modo usa sus propios
 * pasos de la misma rampa, validados contra su superficie (el oscuro contra #1E293B). En claro,
 * aqua y amarillo quedan bajo 3:1: toda gráfica que los use lleva etiquetas visibles (leyenda con valores).
 * `other` (gris) agrupa lo que no cabe en los 4 slots; nunca se genera un color extra.
 */
const lightChart = {
  series1: "#2a78d6",
  series2: "#eb6834",
  series3: "#1baf7a",
  series4: "#eda100",
  other: "#a8a79f",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  inkSecondary: "#52514e",
};

const darkChart: typeof lightChart = {
  series1: "#3987e5",
  series2: "#d95926",
  series3: "#199e70",
  series4: "#c98500",
  other: "#64748B",
  grid: "#334155",
  axis: "#475569",
  muted: "#94A3B8",
  inkSecondary: "#CBD5E1",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

function buildTheme(scheme: ColorScheme) {
  const colors = scheme === "dark" ? darkColors : lightColors;
  const chart = { ...(scheme === "dark" ? darkChart : lightChart), surface: colors.surface };
  const statusColors: Record<ToolStatus, { fg: string; bg: string }> = {
    BODEGA: { fg: colors.success, bg: colors.successSoft },
    EN_PROYECTO: { fg: colors.info, bg: colors.infoSoft },
    EN_TRANSITO: { fg: colors.transit, bg: colors.transitSoft },
    EN_MANTENIMIENTO: { fg: colors.warning, bg: colors.warningSoft },
    DANADA: { fg: colors.danger, bg: colors.dangerSoft },
    EXTRAVIADA: { fg: colors.lost, bg: colors.lostSoft },
    DADA_DE_BAJA: { fg: colors.textMuted, bg: colors.neutralSoft },
    DEVUELTA: { fg: colors.textMuted, bg: colors.neutralSoft },
  };
  return {
    scheme,
    colors,
    chart,
    statusColors,
    font: {
      title: { fontSize: 24, fontWeight: "700" as const, color: colors.text },
      h2: { fontSize: 18, fontWeight: "700" as const, color: colors.text },
      body: { fontSize: 15, color: colors.text },
      small: { fontSize: 13, color: colors.textMuted },
      label: { fontSize: 13, fontWeight: "600" as const, color: colors.textMuted },
    },
    // En oscuro la sombra apenas se ve: la tarjeta se separa del fondo por su tono.
    shadow: {
      shadowColor: scheme === "dark" ? "#000000" : "#0F172A",
      shadowOpacity: scheme === "dark" ? 0.3 : 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  };
}

export type Theme = ReturnType<typeof buildTheme>;

export const themes: Record<ColorScheme, Theme> = { light: buildTheme("light"), dark: buildTheme("dark") };

export const ThemeContext = createContext<Theme>(themes.light);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Estilos que dependen del tema. Se crean una vez por esquema y se reutilizan:
 * `const useStyles = makeStyles(({ colors }) => StyleSheet.create({...}))`.
 */
export function makeStyles<T>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<ColorScheme, T>();
  return function useStyles() {
    const theme = useTheme();
    let styles = cache.get(theme.scheme);
    if (!styles) {
      styles = factory(theme);
      cache.set(theme.scheme, styles);
    }
    return styles;
  };
}
