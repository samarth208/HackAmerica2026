# AEGIS Design System

Read this file before creating or modifying any component. Never hardcode hex values — always use the token names below.

---

## Color Tokens

| Token | Value | CSS var | Usage |
|---|---|---|---|
| bg | `#030712` | `--color-bg` | App background |
| surface | `#0d1117` | `--color-surface` | Panels, cards, header |
| surface-2 | `#161b27` | `--color-surface-2` | Elevated surfaces, hover states |
| border | `#1e293b` | `--color-border` | Panel borders, dividers, separators |
| text-primary | `#f1f5f9` | `--color-text-primary` | Primary labels, headings, values |
| text-muted | `#64748b` | `--color-text-muted` | Placeholder, secondary labels |
| text-data | `#e2e8f0` | `--color-text-data` | Numeric counters, data values |
| threat-green | `#22c55e` | `--color-threat-green` | Nominal / safe |
| threat-amber | `#f59e0b` | `--color-threat-amber` | Advisory / watch |
| threat-orange | `#f97316` | `--color-threat-orange` | Warning / elevated |
| threat-red | `#ef4444` | `--color-threat-red` | Critical / emergency |
| threat-purple | `#a855f7` | `--color-threat-purple` | Extreme / catastrophic |
| accent | `#06b6d4` | `--color-accent` | Interactive elements, links, focus rings, brand highlights |

**Threat severity scale**: green → amber → orange → red → purple (low to extreme).

---

## Typography

| Token | Value | Usage |
|---|---|---|
| font-ui | Inter | Body text, rationale copy, UI labels |
| font-data | JetBrains Mono | Counters, timestamps, lat/lng, numeric values |
| font-brand | Raleway | AEGIS wordmark only |
| font-label | Inter | Uppercase section labels, badge text |

All numeric values displayed in the UI must use `font-data`. All headings and body copy use `font-ui`. The wordmark AEGIS uses `font-brand`.

---

## Spacing

| Token | Value |
|---|---|
| space-1 | 4px |
| space-2 | 8px |
| space-3 | 12px |
| space-4 | 16px |
| space-6 | 24px |

---

## Layout

| Token | Value |
|---|---|
| topbar height | 48px |
| left panel width | 236px |
| right panel width | 280px |
| layer controls height | ~38px |
| status bar height | 28px |
| map area | flex-1 (remaining space) |

---

## Component Rules

- Dark theme throughout — no light mode.
- All text must be readable against dark backgrounds (minimum 4.5:1 contrast ratio).
- Use `font-data` (JetBrains Mono) for all numeric counters and coordinate/time values.
- Use `font-ui` (Inter) for all labels, headings, body text.
- Never hardcode hex color values in component files — use Tailwind classes or CSS variables.
- Action card border-left uses the threat type color from the action_type → TYPE_CONFIG map.
- Severity scale order: green (nominal) → amber (advisory) → orange (warning) → red (critical) → purple (extreme).

---

## Action Card Schema

```ts
{
  id: number | string
  action_type: "dispatch" | "evacuate" | "reposition" | "alert" | "ember_dispatch" | "seismic_alert"
  resource_id: number | null
  zone_id: number | null
  confidence: number        // 0.0–1.0
  time_sensitivity: "immediate" | "high" | "medium" | "low"
  rationale: string
  created_at: string        // ISO 8601
}
```

---

## Map Layers

| Layer key | Data source | Visual |
|---|---|---|
| firePerimeter | WebSocket `fire_hotspots` | Orange polygon fills |
| emberRisk | WebSocket `ember_risk` | Amber/red circle markers |
| seismicDamage | WebSocket `seismic_grid` / `damage_cell` | Green→red GeoJSON cells + circles |
| crews | WebSocket `crew_update` | Cyan (standby) / amber (deployed) / red (unavailable) dots |
| infrastructure | WebSocket `infrastructure` | Cyan squares (shelters) / red + squares (hospitals) |
