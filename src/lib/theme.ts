// Thème de l'interface, mémorisé dans un cookie pour être appliqué dès le rendu serveur (pas de flash)

export type Theme = "light" | "dark";

export const THEME_COOKIE = "tnf-theme";

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
