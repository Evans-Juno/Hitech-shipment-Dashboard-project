import { useEffect, useMemo, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import logo from "@/assets/logo.jpg";
import { ChevronDown, Copy, ExternalLink, PanelLeftClose, PanelLeftOpen, Search, Ship, X } from "lucide-react";
import {
  AS_OF,
  PROJECT,
  formatDate,
  STAGES,
  shipments,
  stageTone,
  type ArrivalStatus,
  type Board,
  type Shipment,
} from "@/data/shipments";

const SEA = [STAGES[0], STAGES[1]] as ArrivalStatus[];
const PORT = [STAGES[2], STAGES[3], STAGES[4]] as ArrivalStatus[];
const DONE = [STAGES[5]] as ArrivalStatus[];

const BRIDGES = ["All bridges", "47+600", "63+700", "Crossbeam", "Other"] as const;
type Bridge = (typeof BRIDGES)[number];
type BoardFilter = Board | "all";
type View = "shipments" | "containers";

type Filters = {
  board: BoardFilter;
  bridge: Bridge;
  status: ArrivalStatus | "All";
  group: string;
  query: string;
};

function bridgeTags(s: Shipment): Bridge[] {
  const tags = new Set<Bridge>();
  for (const part of s.bridge.split("/")) {
    const p = part.trim().toUpperCase();
    if (p === "47+600") tags.add("47+600");
    else if (p === "63+700") tags.add("63+700");
    else if (p === "CROSSBEAM") tags.add("Crossbeam");
    else if (p) tags.add("Other");
  }
  if (s.boxes47 && s.boxes47.length > 0) tags.add("47+600");
  if (tags.size === 0) tags.add("Other");
  return Array.from(tags);
}

/** Containers that belong to the chosen bridge view for this line */
function boxesFor(s: Shipment, bridge: Bridge): string[] {
  if (bridge === "47+600" && s.boxes47 && s.boxes47.length > 0) return s.boxes47;
  return s.boxes ?? [];
}

function ctrCount(s: Shipment, bridge: Bridge) {
  if (bridge === "47+600" && s.boxes47 && s.boxes47.length > 0) return s.boxes47.length;
  return s.containers;
}

function matches(s: Shipment, f: Filters, skip?: keyof Filters) {
  if (skip !== "board" && f.board !== "all" && s.board !== f.board) return false;
  if (skip !== "bridge" && f.bridge !== "All bridges" && !bridgeTags(s).includes(f.bridge)) return false;
  if (skip !== "status" && f.status !== "All" && s.status !== f.status) return false;
  if (skip !== "group" && f.group !== "All" && s.group !== f.group) return false;
  const q = f.query.trim().toLowerCase();
  if (skip !== "query" && q) {
    const hay = [s.bl, s.invoice, s.group, s.bridge, s.type, ...(s.boxes ?? [])].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sumCtr(rows: Shipment[], bridge: Bridge) {
  return rows.reduce((n, r) => n + ctrCount(r, bridge), 0);
}

function stat(rows: Shipment[], statuses: ArrivalStatus[] | undefined, bridge: Bridge) {
  const list = statuses ? rows.filter((r) => statuses.includes(r.status)) : rows;
  return { bls: list.length, containers: sumCtr(list, bridge) };
}

const STAGE_COLORS: Record<ArrivalStatus, string> = {
  "Loaded from Departure Port": "#9cc9ee",
  "Vessel on Sea": "#1c6cb0",
  "Arrived to Nigerian Port": "#f2c14e",
  "Unloaded": "#d99a1e",
  "Under Customs Clearance": "#94610a",
  "Customs Completed": "#1b7f4d",
};

function pct(n: number, total: number) {
  if (total <= 0) return "0%";
  const v = (n / total) * 100;
  return `${v > 0 && v < 1 ? "<1" : Math.round(v)}%`;
}

function StatusCard({
  rows,
  bridge,
  active,
  onPick,
}: {
  rows: Shipment[];
  bridge: Bridge;
  active: ArrivalStatus | "All";
  onPick: (s: ArrivalStatus | "All") => void;
}) {
  const [metric, setMetric] = useState<"containers" | "shipments">("containers");
  const parts = STAGES.map((st) => {
    const list = rows.filter((r) => r.status === st);
    return { st, n: metric === "containers" ? sumCtr(list, bridge) : list.length };
  });
  const total = parts.reduce((a, p) => a + p.n, 0);
  const reached = parts.filter((p) => STAGES.indexOf(p.st) >= 2).reduce((a, p) => a + p.n, 0);
  const cleared = parts[5].n;
  const unit = metric === "containers" ? "containers" : "shipments";

  return (
    <section className="mt-3 rounded-xl border border-border bg-surface p-4" aria-label="Progress by status">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">Progress by status</h3>
        <div className="ml-auto flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Measure">
          {(["containers", "shipments"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={`h-9 rounded-md px-3 text-sm ${metric === m ? "bg-primary font-medium text-primary-ink" : "hover:bg-surface-2"}`}
            >
              {m === "containers" ? "Containers" : "Shipments"}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing to show for these filters.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xl font-semibold">{pct(reached, total)}</p>
              <p className="text-xs text-muted">reached a Nigerian port or beyond ({reached} of {total} {unit})</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-arrived">{pct(cleared, total)}</p>
              <p className="text-xs text-muted">customs completed ({cleared} of {total} {unit})</p>
            </div>
          </div>

          <div
            className="mt-3 flex h-4 overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={parts.map((p) => `${p.st} ${pct(p.n, total)}`).join(", ")}
          >
            {parts.map((p) =>
              p.n > 0 ? <div key={p.st} title={`${p.st}: ${p.n} ${unit} (${pct(p.n, total)})`} style={{ width: `${(p.n / total) * 100}%`, backgroundColor: STAGE_COLORS[p.st] }} /> : null,
            )}
          </div>

          <ul className="mt-3 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {parts.map((p) => (
              <li key={p.st}>
                <button
                  type="button"
                  onClick={() => onPick(active === p.st ? "All" : p.st)}
                  aria-pressed={active === p.st}
                  className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm ${active === p.st ? "bg-surface-2 font-medium ring-1 ring-primary" : "hover:bg-surface-2"}`}
                >
                  <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: STAGE_COLORS[p.st] }} aria-hidden />
                  <span className="min-w-0 flex-1">{p.st}</span>
                  <span className="shrink-0 text-xs text-muted">{p.n} · {pct(p.n, total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function Dashboard() {
  const [f, setF] = useState<Filters>({ board: "all", bridge: "All bridges", status: "All", group: "All", query: "" });
  const [view, setView] = useState<View>("shipments");
  const [sideOpen, setSideOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [open, setOpen] = useState<Shipment | null>(null);
  const [copied, setCopied] = useState(false);
  const [selShip, setSelShip] = useState<string[]>([]);
  const [selCtr, setSelCtr] = useState<string[]>([]);
  const [lastIdx, setLastIdx] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);

  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }));

  const groups = useMemo(() => {
    const base = shipments.filter((s) => matches(s, f, "group") && true);
    return ["All", ...Array.from(new Set(base.map((s) => s.group)))];
  }, [f]);
  const group = groups.includes(f.group) ? f.group : "All";
  const fx: Filters = { ...f, group };

  const rows = useMemo(() => shipments.filter((s) => matches(s, fx)), [fx.board, fx.bridge, fx.status, fx.group, fx.query]);
  const scoped = useMemo(() => shipments.filter((s) => matches(s, fx, "status")), [fx.board, fx.bridge, fx.group, fx.query]);

  const totals = stat(scoped, undefined, f.bridge);
  const done = stat(scoped, DONE, f.bridge);
  const atPort = stat(scoped, PORT, f.bridge);
  const sea = stat(scoped, SEA, f.bridge);

  const containerRows = useMemo(() => {
    const q = f.query.trim().toLowerCase();
    const out: Array<{ no: string; row: Shipment }> = [];
    for (const row of rows) {
      const nos = boxesFor(row, f.bridge);
      const hit = q ? nos.filter((n) => n.toLowerCase().includes(q)) : [];
      for (const no of hit.length ? hit : nos) out.push({ no, row });
    }
    return out;
  }, [rows, f.bridge, f.query]);
  const missing = rows.filter((r) => boxesFor(r, f.bridge).length === 0).length;

  const shipKeys = rows.map((r) => r.id);
  const ctrKeys = containerRows.map((c) => `${c.row.id}|${c.no}`);
  const sel = view === "shipments" ? selShip : selCtr;
  const setSel = view === "shipments" ? setSelShip : setSelCtr;
  const keys = view === "shipments" ? shipKeys : ctrKeys;

  function pick(e: RMouseEvent, key: string, i: number, onOpen: () => void) {
    if (e.shiftKey && lastIdx !== null) {
      const a = Math.min(lastIdx, i);
      const b = Math.max(lastIdx, i);
      setSel(Array.from(new Set([...sel, ...keys.slice(a, b + 1)])));
    } else if (e.ctrlKey || e.metaKey || sel.length > 0) {
      setSel(sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]);
    } else {
      onOpen();
      return;
    }
    setLastIdx(i);
  }
  function toggleBox(key: string, i: number) {
    setSel(sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]);
    setLastIdx(i);
  }
  const allPicked = keys.length > 0 && keys.every((k) => sel.includes(k));
  const toggleAll = () => setSel(allPicked ? sel.filter((k) => !keys.includes(k)) : Array.from(new Set([...sel, ...keys])));
  const noSelect = (e: RMouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault();
  };
  const rowCls = (picked: boolean) =>
    `cursor-pointer border-t border-border hover:bg-surface-2 ${picked ? "bg-surface-2 shadow-[inset_4px_0_0_var(--color-primary)]" : "bg-surface"}`;

  const cols: Col[] =
    view === "shipments"
      ? selShip.flatMap((id) => {
          const s = shipments.find((x) => x.id === id);
          return s ? [shipmentCol(s)] : [];
        })
      : selCtr.flatMap((k) => {
          const [id, no] = k.split("|");
          const s = shipments.find((x) => x.id === id);
          return s ? [containerCol(no, s, k)] : [];
        });
  function removeCol(key: string) {
    setSel(sel.filter((k) => k !== key));
    if (sel.length <= 1) setCompare(false);
  }
  function clearSel() {
    setSelShip([]);
    setSelCtr([]);
    setCompare(false);
    setLastIdx(null);
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(containerRows.map((c) => c.no).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked inside embedded pages */
    }
  }

  const anyFilter = f.board !== "all" || f.bridge !== "All bridges" || f.status !== "All" || group !== "All" || f.query !== "";
  const title = [f.bridge === "All bridges" ? "All bridges" : `Bridge ${f.bridge}`, f.board === "all" ? "both boards" : f.board === "iconic" ? "Iconic Bridges" : "General Shutter"].join(" · ");

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-10 bg-header text-white">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => setSideOpen((v) => !v)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-white/15 px-3 text-sm font-medium hover:bg-white/25"
            aria-expanded={sideOpen}
            aria-controls="filters"
          >
            {sideOpen ? <PanelLeftClose className="size-5" aria-hidden /> : <PanelLeftOpen className="size-5" aria-hidden />}
            <span className="hidden sm:inline">{sideOpen ? "Hide filters" : "Show filters"}</span>
          </button>
          <img src={logo} alt="Hitech" className="size-12 shrink-0 rounded-md bg-white sm:size-14" />
          <div className="min-w-0">
            <p className="hidden text-xs font-medium tracking-[0.18em] text-white/80 uppercase sm:block">Hi-Tech · Bridges Division</p>
            <h1 className="truncate text-lg font-semibold sm:text-2xl">Medina / UniSpan deliveries</h1>
            <p className="truncate text-xs text-white/85 sm:text-sm">{PROJECT} · status as of {AS_OF}</p>
          </div>
          <div className="ml-auto hidden items-center gap-2 text-sm text-white/90 md:flex">
            <Ship className="size-4 text-white" aria-hidden />
            {sumCtr(shipments, "All bridges")} containers on both boards
          </div>
        </div>
      </header>

      <div className="flex items-start">
        {sideOpen ? <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSideOpen(false)} /> : null}
        <aside
          id="filters"
          aria-label="Filters"
          className={
            sideOpen
              ? "fixed inset-y-0 left-0 z-30 w-[85%] max-w-xs overflow-y-auto border-r border-border bg-surface p-4 lg:sticky lg:top-[4.5rem] lg:z-0 lg:max-h-[calc(100vh-4.5rem)] lg:w-72 lg:max-w-none lg:shrink-0"
              : "hidden"
          }
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <p className="text-base font-semibold">Filters</p>
            <button type="button" onClick={() => setSideOpen(false)} className="grid size-11 place-items-center rounded-lg border border-border" aria-label="Close filters">
              <X className="size-4" />
            </button>
          </div>

          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={f.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="B/L, invoice, container no."
              className="h-11 w-full rounded-lg border border-border bg-bg pr-3 pl-9 text-sm"
            />
          </label>

          <div className="mt-4">
            <Section title="Bridge">
              {BRIDGES.map((b) => {
                const list = shipments.filter((s) => matches(s, { ...fx, bridge: "All bridges" }, "bridge") && (b === "All bridges" || bridgeTags(s).includes(b)));
                return (
                  <Opt key={b} active={f.bridge === b} onClick={() => set({ bridge: b })} label={b} count={`${list.length} · ${sumCtr(list, b)} ctr`} />
                );
              })}
              <p className="mt-1 px-1 text-xs text-muted">lines · containers. 47+600 counts only containers allocated to that bridge.</p>
            </Section>

            <Section title="Board">
              {([["all", "Both boards"], ["iconic", "Iconic Bridges"], ["general", "General Shutter"]] as Array<[BoardFilter, string]>).map(([v, label]) => {
                const n = shipments.filter((s) => matches(s, fx, "board") && (v === "all" || s.board === v)).length;
                return <Opt key={v} active={f.board === v} onClick={() => set({ board: v })} label={label} count={String(n)} />;
              })}
            </Section>

            <Section title="Shipment status">
              {(["All", ...STAGES] as Array<ArrivalStatus | "All">).map((st) => {
                const n = shipments.filter((s) => matches(s, fx, "status") && (st === "All" || s.status === st)).length;
                return <Opt key={st} active={f.status === st} onClick={() => set({ status: st })} label={st} count={String(n)} />;
              })}
            </Section>

            <Section title="Shutter group">
              <select
                value={group}
                onChange={(e) => set({ group: e.target.value })}
                className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm"
                aria-label="Shutter group"
              >
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g === "All" ? "All shutter groups" : g}
                  </option>
                ))}
              </select>
            </Section>

            {anyFilter ? (
              <button
                type="button"
                onClick={() => setF({ board: "all", bridge: "All bridges", status: "All", group: "All", query: "" })}
                className="mt-2 h-11 w-full rounded-lg border border-border text-sm font-medium hover:bg-surface-2"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          <h2 className="text-lg font-semibold">{title}</h2>

          <StatusCard rows={scoped} bridge={f.bridge} active={f.status} onPick={(st) => set({ status: st })} />

          <section className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Lines" value={String(totals.bls)} hint={`${totals.containers} containers`} />
            <Stat label="Customs completed" value={String(done.bls)} hint={`${done.containers} containers`} tone="arrived" />
            <Stat label="At port / customs" value={String(atPort.bls)} hint={`${atPort.containers} containers`} tone="transit" />
            <Stat label="Loaded / at sea" value={String(sea.bls)} hint={`${sea.containers} containers`} tone="pending" />
          </section>

          <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="View">
            <ViewTab active={view === "shipments"} onClick={() => { setView("shipments"); setCompare(false); setLastIdx(null); }}>Shipments ({rows.length})</ViewTab>
            <ViewTab active={view === "containers"} onClick={() => { setView("containers"); setCompare(false); setLastIdx(null); }}>Containers ({containerRows.length})</ViewTab>
            {view === "containers" && containerRows.length > 0 ? (
              <button type="button" onClick={copyAll} className="ml-auto inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
                <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy numbers"}
              </button>
            ) : null}
          </div>

          <p className="mt-2 text-xs text-muted">Tip: Ctrl+click rows (or tick the boxes) to pick several, Shift+click for a range, then press Compare.</p>

          <p className="mt-3 text-sm text-muted">
            {view === "shipments"
              ? `Showing ${rows.length} of ${shipments.length} lines · ${sumCtr(rows, f.bridge)} containers`
              : `Showing ${containerRows.length} container numbers from ${rows.length - missing} lines${missing ? ` · ${missing} lines have no container numbers listed yet` : ""}`}
          </p>

          {rows.length === 0 ? (
            <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-10 text-center text-muted">No shipments match these filters.</p>
          ) : view === "shipments" ? (
            <>
              <div className="mt-3 hidden overflow-hidden rounded-xl border border-border md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
                    <tr>
                      <th className="w-10 px-3 py-3"><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all lines" /></th>
                      <th className="px-3 py-3 font-medium">Bridge</th>
                      <th className="px-3 py-3 font-medium">Shutter group</th>
                      <th className="px-3 py-3 font-medium">Invoice</th>
                      <th className="px-3 py-3 font-medium">Bill of lading</th>
                      <th className="px-3 py-3 font-medium">Expected</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Actual</th>
                      <th className="px-3 py-3 font-medium">Track</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.id} className={rowCls(selShip.includes(row.id))} onMouseDown={noSelect} onClick={(e) => pick(e, row.id, i, () => setOpen(row))}>
                        <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selShip.includes(row.id)} onChange={() => toggleBox(row.id, i)} aria-label={`Select ${row.group} ${row.bl}`} />
                        </td>
                        <td className="max-w-44 px-3 py-3 align-top">{row.bridge}</td>
                        <td className="px-3 py-3 align-top">
                          <div>{row.group}</div>
                          <div className="text-xs text-muted">
                            {ctrCount(row, f.bridge)} ctr{ctrCount(row, f.bridge) !== row.containers ? ` of ${row.containers}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top font-mono text-xs">{row.invoice}</td>
                        <td className="px-3 py-3 align-top font-mono text-xs">{row.bl}</td>
                        <td className="px-3 py-3 align-top whitespace-nowrap">{formatDate(row.expected)}</td>
                        <td className="px-3 py-3 align-top"><StatusPill status={row.status} /></td>
                        <td className="px-3 py-3 align-top whitespace-nowrap">{formatDate(row.actual)}</td>
                        <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                          {row.tracking ? (
                            <a href={row.tracking} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
                              Open <ExternalLink className="size-3.5" />
                            </a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="mt-3 flex flex-col gap-3 md:hidden">
                {rows.map((row, i) => (
                  <li key={row.id}>
                    <label className="flex items-center gap-2 px-1 pb-1 text-sm text-muted">
                      <input type="checkbox" checked={selShip.includes(row.id)} onChange={() => toggleBox(row.id, i)} /> Select to compare
                    </label>
                    <button type="button" onClick={() => setOpen(row)} className={`w-full rounded-xl border bg-surface p-4 text-left ${selShip.includes(row.id) ? "border-primary" : "border-border"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{row.group}</p>
                          <p className="mt-0.5 font-mono text-xs text-muted">{row.bl}</p>
                        </div>
                        <StatusPill status={row.status} />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div><dt className="text-xs text-muted">Expected</dt><dd>{formatDate(row.expected)}</dd></div>
                        <div><dt className="text-xs text-muted">Actual</dt><dd>{formatDate(row.actual)}</dd></div>
                        <div><dt className="text-xs text-muted">Bridge</dt><dd>{row.bridge}</dd></div>
                        <div><dt className="text-xs text-muted">Containers</dt><dd>{ctrCount(row, f.bridge)}{ctrCount(row, f.bridge) !== row.containers ? ` of ${row.containers}` : ""}</dd></div>
                        <div className="col-span-2"><dt className="text-xs text-muted">Invoice</dt><dd className="font-mono text-xs">{row.invoice}</dd></div>
                      </dl>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : containerRows.length === 0 ? (
            <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-10 text-center text-muted">No container numbers are listed for these lines yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
                  <tr>
                    <th className="w-10 px-3 py-3"><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all containers" /></th>
                    <th className="px-3 py-3 font-medium">Container</th>
                    <th className="px-3 py-3 font-medium">Shutter group</th>
                    <th className="px-3 py-3 font-medium">Bill of lading</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {containerRows.map(({ no, row }, i) => (
                    <tr key={`${row.id}-${no}`} className={rowCls(selCtr.includes(`${row.id}|${no}`))} onMouseDown={noSelect} onClick={(e) => pick(e, `${row.id}|${no}`, i, () => setOpen(row))}>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selCtr.includes(`${row.id}|${no}`)} onChange={() => toggleBox(`${row.id}|${no}`, i)} aria-label={`Select ${no}`} />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-medium whitespace-nowrap">{no}</td>
                      <td className="px-3 py-2.5">{row.group}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{row.bl}</td>
                      <td className="px-3 py-2.5"><StatusPill status={row.status} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(row.expected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {sel.length > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg">
            <span className="px-2 text-sm font-medium">{sel.length} selected</span>
            <button type="button" onClick={() => setCompare(true)} disabled={cols.length === 0} className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink">
              Compare side by side
            </button>
            <button type="button" onClick={clearSel} className="h-11 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {compare && cols.length > 0 ? <CompareModal cols={cols} onRemove={removeCol} onClose={() => setCompare(false)} /> : null}

      {open ? <Detail shipment={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="group border-t border-border py-3 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </details>
  );
}

function Opt({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${
        active ? "bg-primary font-medium text-primary-ink" : "hover:bg-surface-2"
      }`}
    >
      <span>{label}</span>
      <span className={`shrink-0 text-xs ${active ? "text-white/85" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-11 rounded-lg border px-4 text-sm font-medium ${
        active ? "border-primary bg-primary text-primary-ink" : "border-border bg-bg text-fg hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "arrived" | "transit" | "pending" }) {
  const valueClass = tone === "arrived" ? "text-arrived" : tone === "transit" ? "text-transit" : tone === "pending" ? "text-pending" : "text-fg";
  return (
    <article className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </article>
  );
}

function StatusPill({ status }: { status: ArrivalStatus }) {
  const tone = stageTone(status);
  const cls = tone === "arrived" ? "bg-arrived-bg text-arrived" : tone === "transit" ? "bg-transit-bg text-transit" : "bg-pending-bg text-pending";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${cls}`}>{status}</span>;
}

function Chips({ list, strong }: { list: string[]; strong?: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {list.map((n) => (
        <li key={n} className={`rounded-md border px-2 py-1 font-mono text-xs ${strong ? "border-primary text-primary" : "border-border"}`}>{n}</li>
      ))}
    </ul>
  );
}

function Detail({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const fields: Array<[string, string]> = [
    ["Bridge", shipment.bridge],
    ["Type", shipment.type],
    ["Shutter group", shipment.group],
    ["Commercial invoice", shipment.invoice],
    ["Bill of lading", shipment.bl],
    ["Containers", String(shipment.containers)],
    ["Expected delivery", formatDate(shipment.expected)],
    ["Shipment status", shipment.status],
    ["Actual delivery", formatDate(shipment.actual)],
  ];
  const all = shipment.boxes ?? [];
  const c47 = shipment.boxes47 ?? [];
  const rest = all.filter((n) => !c47.includes(n));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <article
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl border border-border bg-surface p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipment-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-muted uppercase">{shipment.type}</p>
            <h2 id="shipment-title" className="text-xl font-semibold">{shipment.group}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-lg border border-border text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <dl className="mt-4 grid gap-3">
          {fields.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
              <dt className="text-muted">{label}</dt>
              <dd className={label.includes("invoice") || label.includes("lading") ? "font-mono text-xs" : ""}>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 border-t border-border pt-4">
          {all.length === 0 ? (
            <p className="text-sm text-muted">No container numbers listed for this line yet.</p>
          ) : (
            <>
              {c47.length > 0 ? (
                <>
                  <h3 className="text-sm font-semibold">Containers for 47+600 ({c47.length} of {all.length})</h3>
                  <Chips list={c47} strong />
                </>
              ) : null}
              {rest.length > 0 ? (
                <>
                  <h3 className={`text-sm font-semibold ${c47.length ? "mt-4" : ""}`}>{c47.length ? "Other containers on this bill" : "Containers"} ({rest.length})</h3>
                  <Chips list={rest} />
                </>
              ) : null}
            </>
          )}
        </div>

        {shipment.note ? <p className="mt-4 text-sm text-muted">{shipment.note}</p> : null}
        {shipment.tracking ? (
          <a href={shipment.tracking} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink">
            Open carrier tracking <ExternalLink className="size-4" />
          </a>
        ) : (
          <p className="mt-5 text-sm text-muted">No public tracking link on file.</p>
        )}
      </article>
    </div>
  );
}

type Cell = { label: string; t: string; n?: ReactNode };
type Col = { key: string; title: string; sub: string; cells: Cell[] };

const mono = (v: string) => <span className="font-mono text-xs break-all">{v}</span>;
const trackCell = (url: string | null | undefined): Cell => ({
  label: "Tracking",
  t: url ?? "—",
  n: url ? (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
      Open <ExternalLink className="size-3.5" />
    </a>
  ) : (
    "—"
  ),
});

function shipmentCol(s: Shipment): Col {
  const all = s.boxes ?? [];
  const c47 = s.boxes47 ?? [];
  return {
    key: s.id,
    title: s.group,
    sub: s.bl,
    cells: [
      { label: "Bridge", t: s.bridge },
      { label: "Type", t: s.type },
      { label: "Commercial invoice", t: s.invoice, n: mono(s.invoice) },
      { label: "Bill of lading", t: s.bl, n: mono(s.bl) },
      { label: "Status", t: s.status, n: <StatusPill status={s.status} /> },
      { label: "Expected", t: formatDate(s.expected) },
      { label: "Actual", t: formatDate(s.actual) },
      { label: "Containers", t: String(s.containers) },
      { label: "Container numbers", t: all.join(", ") || "—", n: all.length ? <Chips list={all} /> : "—" },
      { label: "47+600 containers", t: c47.join(", ") || "—", n: c47.length ? <Chips list={c47} strong /> : "—" },
      trackCell(s.tracking),
      { label: "Note", t: s.note || "—" },
    ],
  };
}

function containerCol(no: string, s: Shipment, key: string): Col {
  const in47 = (s.boxes47 ?? []).includes(no);
  return {
    key,
    title: no,
    sub: s.group,
    cells: [
      { label: "Container number", t: no, n: <span className="font-mono text-sm font-semibold">{no}</span> },
      { label: "Shutter group", t: s.group },
      { label: "Bill of lading", t: s.bl, n: mono(s.bl) },
      { label: "Commercial invoice", t: s.invoice, n: mono(s.invoice) },
      { label: "Status", t: s.status, n: <StatusPill status={s.status} /> },
      { label: "Expected", t: formatDate(s.expected) },
      { label: "Actual", t: formatDate(s.actual) },
      { label: "Bridge", t: s.bridge },
      { label: "Allocated to 47+600", t: in47 ? "Yes" : "No" },
      { label: "Containers on this bill", t: String(s.containers) },
      trackCell(s.tracking),
    ],
  };
}

function CompareModal({ cols, onRemove, onClose }: { cols: Col[]; onRemove: (key: string) => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    const lines = [["", ...cols.map((c) => c.title)].join("\t")];
    cols[0].cells.forEach((cell, i) => lines.push([cell.label, ...cols.map((c) => c.cells[i].t.replace(/\s+/g, " "))].join("\t")));
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked inside embedded pages */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <section
        className="flex max-h-[92vh] w-fit max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Side-by-side comparison"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">Comparing {cols.length}</h2>
          <button type="button" onClick={copy} className="ml-auto inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
            <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy as table"}
          </button>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-lg border border-border" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-auto">
          <table className="border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 min-w-36 bg-surface-2 px-3 py-3" />
                {cols.map((c) => (
                  <th key={c.key} className="sticky top-0 z-10 min-w-56 max-w-72 border-l border-border bg-surface-2 px-3 py-3 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold break-words">{c.title}</p>
                        <p className="text-xs font-normal break-all text-muted">{c.sub}</p>
                      </div>
                      <button type="button" onClick={() => onRemove(c.key)} className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface" aria-label={`Remove ${c.title}`}>
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols[0].cells.map((cell, i) => (
                <tr key={cell.label} className="border-t border-border">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 align-top text-xs font-medium text-muted">{cell.label}</th>
                  {cols.map((c) => (
                    <td key={c.key} className="border-l border-border px-3 py-2.5 align-top break-words">
                      {c.cells[i].n ?? c.cells[i].t}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}