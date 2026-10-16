import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { secureStorage } from "@/lib/secure-storage";
import { ThemeContext, themes } from "@/theme";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme.preference";

interface PreferenceState {
  preference: ThemePreference;
  setPreference(p: ThemePreference): void;
}

const PreferenceContext = createContext<PreferenceState | null>(null);

/** Resuelve el tema (preferencia del usuario o, por defecto, la del sistema) y lo recuerda en el dispositivo. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    secureStorage
      .getItem(STORAGE_KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setPreferenceState(v);
      })
      .catch(() => undefined);
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    secureStorage.setItem(STORAGE_KEY, p).catch(() => undefined);
  }, []);

  const scheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
  const prefValue = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return (
    <PreferenceContext.Provider value={prefValue}>
      <ThemeContext.Provider value={themes[scheme]}>{children}</ThemeContext.Provider>
    </PreferenceContext.Provider>
  );
}

export function useThemePreference(): PreferenceState {
  const ctx = useContext(PreferenceContext);
  if (!ctx) throw new Error("useThemePreference debe usarse dentro de ThemeProvider");
  return ctx;
}
