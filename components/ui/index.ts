/**
 * AZ-Lab UI primitive kit.
 *
 * Compose widgets from these instead of hand-rolling Tailwind chrome. Each is a
 * thin wrapper over an app/skin.css class built from the lib/colorThemes.ts
 * tokens, so every primitive recolors across all three themes for free.
 *
 *   import { Card, Bar, Section, StatusGlyph, SignalPill, Metric } from '@/components/ui'
 *
 * Adding a new style → add a class in app/skin.css (+ optionally a wrapper here).
 * Adding a new theme  → add a --t-* block in lib/colorThemes.ts.
 */
export { default as Card } from './Card'
export { default as Bar, type Tone } from './Bar'
export { default as Section } from './Section'
export { default as Metric } from './Metric'
export { StatusGlyph, StatusChip, SignalPill } from './Status'
