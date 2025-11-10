"use client";

import * as React from "react";

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyThemeAttr(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = React.useState<"light" | "dark" | null>(null);

  React.useEffect(() => {
    const stored = (typeof window !== "undefined" && window.localStorage.getItem("theme")) as
      | "light"
      | "dark"
      | null;
    const initial = stored ?? (getSystemPrefersDark() ? "dark" : "light");
    setTheme(initial);
    applyThemeAttr(initial);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyThemeAttr(next);
    try {
      window.localStorage.setItem("theme", next);
    } catch {}
  };

  return (
    <button
      aria-label="Toggle theme"
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-foreground/15 bg-foreground/5 text-foreground transition-colors hover:bg-foreground/10"
      title="Toggle theme"
    >
      {/* Simple sun/moon icon swap */}
      <span className="sr-only">Toggle theme</span>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="currentColor"
      >
        {theme === "dark" ? (
          // Sun icon
          <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zm10.48 14.32l1.79 1.79 1.41-1.41-1.79-1.79-1.41 1.41zM12 4V1h-1v3h1zm0 19v-3h-1v3h1zM4 12H1v1h3v-1zm19 0h-3v1h3v-1zM6.76 19.16l-1.8 1.79 1.41 1.41 1.8-1.79-1.41-1.41zM19.16 6.76l1.79-1.8-1.41-1.41-1.79 1.8 1.41 1.41zM11.5 7a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
        ) : (
          // Moon icon
          <path d="M12 2a9.93 9.93 0 00-7.07 2.93A10 10 0 1012 2zm0 18a8 8 0 01-5.66-13.66A10 10 0 0012 20z" />
        )}
      </svg>
    </button>
  );
}


