# Lab Widget Module Contract

The `/lab` landing page is **registry-driven**. Tiles are declared once in
`lib/lab-widgets.tsx`; the page (`app/lab/page.tsx`) only lays them out. This is
the "self-contained modules with a documented data-source contract" from
Phase 2 of the modernization plan — new tiles (metrics, agents, spend) drop in
without touching core page code.

## The three pieces

| Piece | File | Responsibility |
|-------|------|----------------|
| **Registry** | `lib/lab-widgets.tsx` | The single source of truth: an ordered list of `LabWidget` entries. |
| **Chrome** | `components/lab/LabTile.tsx` | Presentational card wrapper: border, padding, header row, `↗ expand` link. |
| **Data hook** | `lib/hooks/useWidgetData.ts` | `useWidgetData(endpoint, opts)` → `{ data, loading, error, refresh }`. Fetch-on-mount + fixed-interval poll + lifecycle. |

## Data-source contract

- A widget is a **self-contained client component** that fetches its **own** data
  from the API route named in its registry `endpoint`, via `useWidgetData`.
- The page **never** fetches on a widget's behalf — it only decides layout.
- Each widget owns its loading / empty / error states. `useWidgetData` preserves
  the last good `data` on a failed poll (transient blips don't blank the tile).
- `endpoint` in the registry is the documented contract between the tile and its
  API route. Keep it accurate even for widgets not yet migrated to the hook.

`HostMetrics.tsx` is the reference implementation:

```tsx
const { data: metrics, loading } = useWidgetData<HostMetricsType[]>('/api/metrics', {
  select: (raw) => (raw as { metrics?: HostMetricsType[] }).metrics ?? [],
})
```

`select` is read through a ref, so passing an inline mapper does **not** restart
the poll timer. The effect only re-runs when `endpoint` or `intervalMs` change.

## Adding a tile

1. Build the data route under `app/api/<name>/route.ts` (thin — delegate to `lib/`).
2. Build the client component under `components/lab/`, using `useWidgetData('/api/<name>')`.
3. Add **one** entry to `labWidgets` in `lib/lab-widgets.tsx`:

```ts
{
  id: 'zfs-pools',            // stable — also the #anchor
  section: 'Infrastructure',  // which landing section it groups under
  title: 'ZFS Pools',
  component: ZfsPoolsWidget,
  endpoint: '/api/storage',
  expandHref: '/lab/monitor', // optional
  accent: 'text-emerald-400/70', // optional header color
  // bare: true,              // set if the widget draws its own header
  // enabled: false,          // set to hide without deleting the entry
}
```

No change to `app/lab/page.tsx` is needed.

## Sections

The landing page groups tiles into sections rendered in `labSectionOrder`
(`Infrastructure` → `Agents & Spend` → `Security & Backups`). Every widget
declares a `section`. To add a section, extend the `LabSection` union and
`labSectionOrder` in `lib/lab-widgets.tsx`; the page renders any section that
has at least one enabled widget.

## Notes

- `id` doubles as the in-page anchor. `StatusPills` links to `#security` and
  `#claude-spend` — don't rename those ids without updating the linker.
- `bare: true` skips `LabTile`'s header row for widgets that render their own
  (e.g. `AgentHealthCard`, `BackupsWidget`).
- Detail/expanded views live under `app/lab/<name>/` and are linked via
  `expandHref`; they are separate routes, not part of the registry.
