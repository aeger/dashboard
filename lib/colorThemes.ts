/**
 * AZ-Lab dashboard — three accessible color themes.
 *
 * Drop-in for the existing token-override system in lib/themes.ts (the same
 * mechanism the holiday themes use). Each theme is a flat map of CSS custom
 * properties applied on :root[data-theme="…"]. Components already read these
 * vars through the Tailwind zinc/accent mapping, so no component changes are
 * required for the recolor itself — see THEMES.md for the behavioural rules
 * (shape-coded status, figure-only color) that DO touch components.
 *
 * Source of truth for the values: AZLabThemeLab.dc.html.
 */

export type ThemeId = "graphite" | "daylight" | "universal";

export interface Theme {
  id: ThemeId;
  label: string;
  base: "dark" | "light";
  /** true = status hues chosen for color-vision deficiency (Okabe-Ito). */
  colorSafe: boolean;
  /** CSS custom properties written to the theme root. */
  vars: Record<string, string>;
}

/* ── Dark · "Graphite / Signal" ──────────────────────────────────────────
   Deep slate (not pure black) + a single cyan through-line accent.
   Default theme. */
const graphite: Theme = {
  id: "graphite",
  label: "Graphite",
  base: "dark",
  colorSafe: false,
  vars: {
    "--t-bg": "#0e1217", "--t-bg2": "#12161d", "--t-surf": "#161b23",
    "--t-surf2": "#1b212b", "--t-surf3": "#222a36",
    "--t-bord": "#252d3a", "--t-bord2": "#2c3542",
    "--t-tx": "#e7ecf2", "--t-txd": "#98a3b3", "--t-txf": "#5f6b7b",
    "--t-acc": "#38bdf8", "--t-acc2": "#22d3ee",
    "--t-accsoft": "rgba(56,189,248,.12)", "--t-accline": "rgba(56,189,248,.34)",
    "--t-onacc": "#07131c",
    "--t-ok": "#34d399", "--t-warn": "#fbbf24", "--t-crit": "#f87171", "--t-info": "#60a5fa",
    "--t-oktx": "#6ee7b7", "--t-warntx": "#fcd34d", "--t-crittx": "#fca5a5", "--t-infotx": "#93c5fd",
    "--t-oksoft": "rgba(52,211,153,.13)", "--t-warnsoft": "rgba(251,191,36,.14)",
    "--t-critsoft": "rgba(248,113,113,.15)", "--t-infosoft": "rgba(96,165,250,.13)",
    "--t-track": "rgba(255,255,255,.06)",
    "--t-shadow": "0 1px 2px rgba(0,0,0,.5)",
    "--t-shadowh": "0 16px 42px rgba(0,0,0,.55)",
  },
};

/* ── Light · "Daylight / Paper" ──────────────────────────────────────────
   Warm-cool paper base, white cards, deep-teal accent.
   Elevation via shadow, not heavy borders. */
const daylight: Theme = {
  id: "daylight",
  label: "Daylight",
  base: "light",
  colorSafe: false,
  vars: {
    "--t-bg": "#eceef1", "--t-bg2": "#f5f7f9", "--t-surf": "#ffffff",
    "--t-surf2": "#f3f5f8", "--t-surf3": "#e9edf1",
    "--t-bord": "#dde2e8", "--t-bord2": "#e7ebf0",
    "--t-tx": "#161b22", "--t-txd": "#54606f", "--t-txf": "#8a94a2",
    "--t-acc": "#0d9488", "--t-acc2": "#0891b2",
    "--t-accsoft": "rgba(13,148,136,.10)", "--t-accline": "rgba(13,148,136,.34)",
    "--t-onacc": "#ffffff",
    "--t-ok": "#059669", "--t-warn": "#d97706", "--t-crit": "#dc2626", "--t-info": "#2563eb",
    "--t-oktx": "#047857", "--t-warntx": "#b45309", "--t-crittx": "#b91c1c", "--t-infotx": "#1d4ed8",
    "--t-oksoft": "rgba(5,150,105,.10)", "--t-warnsoft": "rgba(217,119,6,.11)",
    "--t-critsoft": "rgba(220,38,38,.10)", "--t-infosoft": "rgba(37,99,235,.10)",
    "--t-track": "rgba(16,24,40,.08)",
    "--t-shadow": "0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)",
    "--t-shadowh": "0 14px 34px rgba(16,24,40,.14)",
  },
};

/* ── Universal · color-blind-safe (Okabe-Ito, dark base) ─────────────────
   Status hues are the Okabe-Ito CVD-safe set. Pair with shape-coded status
   (see THEMES.md) so meaning never rests on hue alone. */
const universal: Theme = {
  id: "universal",
  label: "Universal",
  base: "dark",
  colorSafe: true,
  vars: {
    "--t-bg": "#14171c", "--t-bg2": "#171b22", "--t-surf": "#1b2028",
    "--t-surf2": "#222833", "--t-surf3": "#2a323f",
    "--t-bord": "#2f3945", "--t-bord2": "#38424f",
    "--t-tx": "#eef1f5", "--t-txd": "#a6b0bd", "--t-txf": "#6b7683",
    "--t-acc": "#56b4e9", "--t-acc2": "#0072b2",
    "--t-accsoft": "rgba(86,180,233,.15)", "--t-accline": "rgba(86,180,233,.36)",
    "--t-onacc": "#07131c",
    // Okabe-Ito: bluish-green / orange / vermillion / sky
    "--t-ok": "#009e73", "--t-warn": "#e69f00", "--t-crit": "#d55e00", "--t-info": "#56b4e9",
    "--t-oktx": "#4ec9a6", "--t-warntx": "#f0b64d", "--t-crittx": "#ff8a4d", "--t-infotx": "#8fd0f2",
    "--t-oksoft": "rgba(0,158,115,.16)", "--t-warnsoft": "rgba(230,159,0,.16)",
    "--t-critsoft": "rgba(213,94,0,.17)", "--t-infosoft": "rgba(86,180,233,.15)",
    "--t-track": "rgba(255,255,255,.06)",
    "--t-shadow": "0 1px 2px rgba(0,0,0,.5)",
    "--t-shadowh": "0 16px 42px rgba(0,0,0,.55)",
  },
};

export const themes: Record<ThemeId, Theme> = { graphite, daylight, universal };
export const defaultThemeId: ThemeId = "graphite";

/** Serialize a theme's vars into a CSS text block for a [data-color-theme] selector.
 *  Uses `data-color-theme` (not `data-theme`, which the holiday themes own) so the
 *  two systems compose: color theme = base palette, holiday theme = seasonal overlay. */
export function themeCss(t: Theme): string {
  const body = Object.entries(t.vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `:root[data-color-theme="${t.id}"] {\n${body}\n}`;
}

/** Emit all themes as one stylesheet string (e.g. for a <style> in layout). */
export function allThemesCss(): string {
  return Object.values(themes).map(themeCss).join("\n\n");
}

/** Apply at runtime (client) + persist. Sets `data-color-theme` on <html>. */
export const THEME_STORAGE_KEY = "az-color-theme";
export function applyTheme(id: ThemeId): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-color-theme", id);
    try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* ignore */ }
  }
}

/* ── Status vocabulary — MUST stay identical across all three themes ──────
   Status is encoded by SHAPE + LABEL, not color alone. This is what makes the
   universal theme accessible without a separate render path. See THEMES.md. */
export type Tone = "ok" | "warn" | "crit" | "info" | "idle";

export const statusGlyph: Record<Tone, string> = {
  ok: "\u25CF",    // ● operational / up
  warn: "\u25B2",  // ▲ degraded
  crit: "\u25A0",  // ■ down / failing
  info: "\u25C6",  // ◆ notice
  idle: "\u25CB",  // ○ idle / unknown
};

export const statusLabel: Record<Tone, string> = {
  ok: "UP", warn: "WARN", crit: "DOWN", info: "INFO", idle: "IDLE",
};

/** Token names for a tone — figure + soft bg + text-on-soft only. */
export const toneVars = (t: Exclude<Tone, "idle">) => ({
  figure: `var(--t-${t})`,
  soft: `var(--t-${t}soft)`,
  text: `var(--t-${t}tx)`,
});
