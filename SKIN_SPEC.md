# AZ-Lab dashboard — prototype skin spec (theme-system branch)

Source of truth: `~/claude/context/AZLabThemeLab.dc.html`. Goal: make the live
Next.js widgets adopt the prototype's visual language (not just its palette).
Colors are already ported (lib/colorThemes.ts). This is the CHROME layer.

All values reference the theme tokens (`--t-*`) so they recolor per theme.

## Fonts
- Sans (`--font-inter` → now IBM Plex Sans): titles, body.
- Mono (`--font-mono` → now IBM Plex Mono): ALL labels, values, numerals, chips.

## Card / panel
```
background: var(--t-surf);
border: 1px solid var(--t-bord);
border-radius: 11px;
padding: 15px;
box-shadow: var(--t-shadow);
```
- `.lift`: hover translateY(-3px), box-shadow → --t-shadowh, border-color → --t-accline.
- `.ticks`: absolutely-positioned L-brackets in TL + BR corners (1.5px --t-accline, 8px, radius 2px, opacity .6).

## Inner tile (metric cell)
```
background: var(--t-surf2);
border: 1px solid var(--t-bord2);
border-radius: 8px;
padding: 10px 11px;
```

## Bars / meters (the signature)
- Track: `height:7-8px; border-radius:99px; background:var(--t-track); overflow:hidden; position:relative`.
- Fill: absolute, colored `var(--t-acc|ok|warn|crit)`, radius 99px, `transition:width .5s cubic-bezier(.4,0,.2,1)`.
- Segment overlay (ON TOP of fill): `position:absolute;inset:0;`
  `background:repeating-linear-gradient(90deg,transparent 0 10px,var(--t-surf2) 10px 11px);opacity:.55`.
- Optional threshold tick: 2px×9px --t-txd mark at a % offset.

## Section header
```
[mono 600 10px, letter-spacing .28em, --t-txf]  01
[sans 600 11px, letter-spacing .22em, uppercase, --t-txd]  TITLE
[flex spacer: height 1px, background --t-bord]
```

## Signal pill (top KPI row)
```
display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:9px;
background:var(--t-surf); border:1px solid var(--t-bord); box-shadow:var(--t-shadow);
[shape glyph colored by tone] [mono 600 9.5px .13em uppercase --t-txf label] [mono value, margin-left:auto]
```

## Typography atoms
- Micro-label: `font:600 9-10px/1 mono; letter-spacing:.12-.15em; text-transform:uppercase; color:var(--t-txf)`.
- Big numeral: `font:300 26px/.85 mono; letter-spacing:-.02em; font-variant-numeric:tabular-nums`.
- Value/meta: `font:500 10-11px/1 mono; color:var(--t-tx|txd|txf); font-variant-numeric:tabular-nums`.

## Status vocabulary (from lib/colorThemes.ts)
● UP (ok) · ▲ WARN (warn) · ■ DOWN (crit) · ◆ INFO (info) · ○ IDLE (idle)
Color by tone token; SHAPE carries meaning (CVD-safe under universal).

## Implementation strategy
1. Add reusable classes to app/globals.css (`.az-card`, `.az-tile`, `.az-bar`,
   `.az-bar__fill`, `.az-bar__seg`, `.az-section`, `.az-label`, `.az-metric`,
   `.az-pill`) encoding the above with theme tokens.
2. Restyle SHARED primitives first (any Card/Panel/Widget wrapper + Bar/Progress
   component) so the look propagates. Then targeted widget passes.
3. Keep radius 11px cards, 8px tiles; segmented bar overlay; mono labels; thin numerals.
