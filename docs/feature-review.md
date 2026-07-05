# Dashboard Feature Review — 2026-07-01 (Phase 2)

Audit of every dashboard surface: purpose, data source, and a keep / merge /
retire recommendation. Companion to the widget module contract (`widgets.md`).
Source of truth is `~/dashboard/` (never `~/azlab/services/dashboard/`).

## Top-level navigation (`SiteHeader`)

| Tab | Path | Purpose | Data source | Verdict |
|-----|------|---------|-------------|---------|
| Home | `/` | Family landing — clock, weather, photos, calendar, Gmail, news, messages | HA/weather API, Google, Immich, RSS | **Keep** |
| Lab Status | `/lab` | Infra operations landing (registry-driven tiles) | see below | **Keep** — redesigned this phase |
| News Feed | `/news` | Tech/news reader | RSS + `/api/news` | **Keep** |
| Home Assistant | `/haos` | Embedded HA dashboards | HA REST + `/api/homeassistant` | **Keep** |
| Vision & Goals | `/goals` | Goal hierarchy from Supabase `goals` | `/api/goals` | **Keep** |
| Notifications | `/notifications` | Sentinel notification history | `/api/notifications` | **Keep** — future ntfy audit tile lands here |

## `/lab` landing tiles (registry: `lib/lab-widgets.tsx`)

Grouped into sections this phase.

### Infrastructure
| Tile | Component | Endpoint → source | Verdict |
|------|-----------|-------------------|---------|
| Host Metrics | `HostMetrics` + `HostMetricsCharts` | `/api/metrics` → Prometheus `node` | **Keep** |
| Lab Monitor | `LabMonitor` | `/api/services` → service health | **Keep** |
| Endpoint Health | `EndpointProbes` | `/api/probes` → Prometheus `blackbox-http-*` | **New** this phase |
| Storage / ZFS Pools | `StoragePools` | `/api/storage` → Prometheus `pve` (`pve_disk_*`) | **Promoted** to landing this phase |

### Agents & Spend
| Tile | Component | Endpoint → source | Verdict |
|------|-----------|-------------------|---------|
| Agent Health | `AgentHealthCard` | `/api/agent-health` → Supabase `agent_activity` | **Keep** |
| Claude Spend | `ClaudeSpendWidget` | `/api/claude-spend` → `~/.local/state/claude-spend/usage.jsonl` | **Keep** (Phase 1) |

### Security & Backups
| Tile | Component | Endpoint → source | Verdict |
|------|-----------|-------------------|---------|
| Security | `SecurityWidget` | `/api/security` → live scan route | **Keep** |
| Backups | `BackupsWidget` | `/api/backups` | **Keep** |

## `/lab` sub-tools (`LabSubNav` / `ToolPills`)

| Tool | Path | Purpose | Verdict |
|------|------|---------|---------|
| Terminal | `/lab/terminal` | Web terminal / TerminalHub | **Keep** |
| Proxies | `/lab/proxies` | Traefik proxy manager | **Keep** |
| RustDesk | `/lab/rustdesk` | Remote-desktop peers | **Keep** |
| Traefik | `/lab/traefik` | Router/service view | **Merge candidate** — overlaps `/lab/proxies`; consider unifying under one "Routing" view |
| Monitor | `/lab/monitor` | Expanded metrics (host, ZFS, spend, anomalies, services, containers, network) | **Keep** — the "expand" target for landing tiles |
| Containers | `/lab/containers` | Container list + metrics + logs + actions | **Keep** |
| Security | `/lab/security` | Expanded security scan | **Keep** |
| Tasks | `/lab/tasks` | Task queue (huge: `TaskQueueExpanded` ~3.2k LOC) | **Keep** — flag for future modular split |
| News | `/lab/news` | Lab news view | **Review** — overlaps top-level `/news`; confirm both are wanted |

## Status/tool pills

- `StatusPills` — quick counts linking to `/lab/containers`, `/lab/tasks`,
  `/goals`, and `#security` / `#claude-spend` anchors. **Keep** (anchor ids are
  a contract — see `widgets.md`).
- `ToolPills` — shortcuts mirrored in `LabSubNav`. **Keep**.

## Recommendations summary

1. **Merge** `/lab/traefik` + `/lab/proxies` into one routing view (overlapping concerns).
2. **Review** `/lab/news` vs top-level `/news` for duplication.
3. **Future modular split** of `TaskQueueExpanded.tsx` (~3.2k LOC) — largest single component.
4. Landing now sectioned + registry-driven; new tiles (agent liveness from
   Phase 5, ntfy/council audit from ntfy work) drop in via one registry entry.

*Recommendations 1–3 are non-destructive proposals — not actioned here.*
