import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type ThemeMode = "light" | "dark";
type Locale = "en" | "ar";

type UiState = {
  theme: ThemeMode;
  locale: Locale;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const systemTheme = (): ThemeMode =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: systemTheme(),
      locale: "en",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
      setLocale: (locale) => set({ locale }),
      toggleLocale: () =>
        set((state) => ({ locale: state.locale === "en" ? "ar" : "en" })),
    }),
    {
      name: "enterprise-erp-ui",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
