"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (!localStorage.getItem("ruang-saku-theme")) {
          const next: Theme = mq.matches ? "dark" : "light";
          document.documentElement.dataset.theme = next;
          setTheme(next);
        }
      } catch { /* abaikan */ }
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("ruang-saku-theme", next);
      } catch { /* abaikan */ }
      return next;
    });
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useContext(ThemeCtx);
  return (
    <button
      type="button"
      className={className ?? "theme-toggle"}
      onClick={toggle}
      title={theme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      aria-label="Ganti tema"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;
  return (
    <button
      type="button"
      className={className ?? "install-button"}
      onClick={async () => {
        try {
          await deferred.prompt();
        } catch { /* abaikan */ }
        setDeferred(null);
      }}
      title="Install aplikasi ke perangkat"
    >
      ⤓ Install
    </button>
  );
}
