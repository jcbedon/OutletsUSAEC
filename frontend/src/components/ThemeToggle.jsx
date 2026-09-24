import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "astrid_theme";

export const applyTheme = (theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
};

export const getStoredTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) || "light";
  } catch (_e) {
    return "light";
  }
};

/**
 * Very small light/dark theme toggle. Persists the choice in localStorage and
 * toggles the `dark` class on <html> (Tailwind `darkMode: "class"`).
 * Light uses a soft #FFF7FA surface; dark is a night-friendly palette.
 */
export const ThemeToggle = ({ className = "" }) => {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_e) {
      /* ignore */
    }
    // Keep other mounted toggles in sync.
    window.dispatchEvent(new CustomEvent("astrid-theme-change", { detail: theme }));
  }, [theme]);

  useEffect(() => {
    const onChange = (e) => setTheme(e.detail);
    window.addEventListener("astrid-theme-change", onChange);
    return () => window.removeEventListener("astrid-theme-change", onChange);
  }, []);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex items-center justify-center h-7 w-7 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors ${className}`}
      title={isDark ? "Modo claro" : "Modo noche"}
      aria-label={isDark ? "Activar modo claro" : "Activar modo noche"}
      data-testid="theme-toggle-btn"
    >
      {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
};

export default ThemeToggle;
