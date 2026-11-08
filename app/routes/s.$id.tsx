import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  callAction,
  setClientAppState,
  useActionMutation,
  useActionQuery,
  useDbSync,
} from "@agent-native/core/client/hooks";
import {
  IconArrowLeft,
  IconBell,
  IconChevronDown,
  IconEye,
  IconFlask,
  IconMapPin,
  IconMessageQuestion,
  IconPencil,
  IconPhone,
  IconPin,
  IconRefresh,
  IconRobot,
  IconSparkles,
  IconHandFinger,
  IconUser,
  IconWorldSearch,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import {
  DemoBadge,
  EmergencyFooter,
  HeldRibbon,
  naira,
  RxBadge,
  StatusChip,
  timeAgo,
  type DisplayStatus,
} from "@/components/rounds/status";
import { useInstallRoundsAutomations } from "@/components/rounds/use-install-automations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Rounds · Live board" }];
}

type SortKey = "best" | "cheapest" | "closest";

type Board = NonNullable<ReturnType<typeof useBoard>["data"]>;
type BoardAsk = Board["asks"][number];

function useBoard(id: string, fast: boolean) {
  return useActionQuery("get-search", { id }, { refetchInterval: fast ? 4000 : 15000, enabled: Boolean(id) });
}

const PENDING: DisplayStatus[] = ["asked", "reading", "queued"];

function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function sourceTag(source: string | undefined, confidence: number | null | undefined) {
  switch (source) {
    case "agent":
      return { icon: IconRobot, text: `Read by Rounds AI${confidence ? ` · ${Math.round(confidence * 100)}%` : ""}` };
    case "rules":
      return { icon: IconRobot, text: `Read automatically${confidence ? ` · ${Math.round(confidence * 100)}%` : ""}` };
    case "button":
      return { icon: IconHandFinger, text: "Tapped by pharmacist" };
    case "link":
      return { icon: IconHandFinger, text: "Sent via reply link" };
    case "user_edit":
      return { icon: IconUser, text: "Edited by you" };
    default:
      return null;
  }
}

export default function BoardRoute() {
  useInstallRoundsAutomations();
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [fast, setFast] = useState(true);
  const board = useBoard(id, fast);
  const [sort, setSort] = useState<SortKey>("best");
  const [selectedAskId, setSelectedAskId] = useState<string | null>(null);
  const [editAsk, setEditAsk] = useState<BoardAsk | null>(null);
  const [holdAsk, setHoldAsk] = useState<BoardAsk | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [widening, setWidening] = useState(false);

  useDbSync({ queryClient, realtime: { reason: "pharmacist replies arrive by webhook and demo timers" } });

  const data = board.data;
  const anyPending = Boolean(
    data &&
      (data.asks.some((a) => PENDING.includes(a.displayStatus as DisplayStatus)) ||
        data.asks.some((a) => a.hold?.status === "requested")),
  );
  useEffect(() => setFast(anyPending || !data), [anyPending, data]);

  // Track arrivals so new replies animate in.
  const seen = useRef(new Map<string, string>());
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const fresh = new Set<string>();
    for (const a of data.asks) {
      const key = `${a.displayStatus}:${a.latestReply?.id ?? ""}:${a.hold?.status ?? ""}`;
      const prev = seen.current.get(a.id);
      if (prev !== undefined && prev !== key) fresh.add(a.id);
      seen.current.set(a.id, key);
    }
    if (fresh.size) {
      setArrived(fresh);
      const t = setTimeout(() => setArrived(new Set()), 1600);
      return () => clearTimeout(t);
    }
  }, [data]);

  const asks = useMemo(() => {
    const list = [...(data?.asks ?? [])];
    if (sort === "cheapest") {
      list.sort((a, b) => {
        const pa = a.latestReply?.priceNaira && (a.displayStatus === "in_stock" || a.displayStatus === "alternative") ? a.latestReply.priceNaira : Infinity;
        const pb = b.latestReply?.priceNaira && (b.displayStatus === "in_stock" || b.displayStatus === "alternative") ? b.latestReply.priceNaira : Infinity;
        return pa - pb || a.pharmacy.distanceKm - b.pharmacy.distanceKm;
      });
    } else if (sort === "closest") {
      list.sort((a, b) => a.pharmacy.distanceKm - b.pharmacy.distanceKm);
    }
    return list;
  }, [data, sort]);

  function select(a: BoardAsk) {
    setSelectedAskId(a.id);
    const status = a.latestReply?.priceLabel ? `${a.displayStatus} ${a.latestReply.priceLabel}` : a.displayStatus;
    void setClientAppState(
      "selection",
      {
        searchId: id,
        askId: a.id,
        pharmacyName: a.pharmacy.name,
        displayStatus: a.displayStatus,
        label: `${a.pharmacy.name} — ${status}`,
      },
      { keepalive: true },
    ).catch(() => undefined);
  }

  useEffect(() => {
    return () => {
      void setClientAppState("selection", null).catch(() => undefined);
    };
  }, [id]);

  const nudge = useActionMutation("nudge-pharmacy", {
    onSuccess: () => toast.success("Reminder sent"),
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't nudge"),
  });
  const updateSearch = useActionMutation("update-search", {
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't update"),
  });
  const cancelHold = useActionMutation("cancel-hold", {
    onSuccess: () => toast.success("Hold cancelled; the pharmacy has been told"),
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't cancel"),
  });

  async function widen() {
    if (!data) return;
    setWidening(true);
    try {
      const r = await callAction("find-pharmacies", {
        lat: data.search.lat,
        lng: data.search.lng,
        radiusKm: 10,
        drugKey: data.search.drugKey,
        limit: 30,
      });
      const asked = new Set(data.asks.map((a) => a.pharmacy.id));
      const more = r.pharmacies.filter((p) => !asked.has(p.id)).slice(0, 8).map((p) => p.id);
      if (!more.length) {
        toast.message("No other reachable pharmacies within 10 km yet.");
        return;
      }
      const res = await callAction("ask-more-pharmacies", { searchId: id, pharmacyIds: more });
      toast.success(`Asked ${res.asked} more pharmac${res.asked === 1 ? "y" : "ies"}`);
      await board.refetch();
    } catch (e) {
      toast.error(actionErrorMessage(e) ?? "Couldn't widen the search");
    } finally {
      setWidening(false);
    }
  }

  if (board.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (board.isError || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <p className="font-medium">{actionErrorMessage(board.error) ?? "This search couldn't be loaded."}</p>
        <Link to="/rounds" className="mt-3 inline-block text-sm text-primary underline">
          Start a new search
        </Link>
      </div>
    );
  }

  const { search, counts } = data;
  const best = data.asks.find((a) => a.id === data.bestAskId);
  const total = Math.max(1, counts.asked);
  const replied = counts.replied;
  const allOut = counts.pending === 0 && counts.inStock === 0 && counts.alternative === 0 && counts.asked > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 sm:px-6">
      <Link to="/rounds" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <IconArrowLeft className="size-4" /> New search
      </Link>

      <header className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              {search.drugLabel} {search.rxRequired ? <RxBadge /> : null}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <IconMapPin className="size-4" /> {search.areaLabel}
              </span>
              <span>· asked {search.createdLabel}</span>
              <span>· {search.acceptEquivalents ? "equivalents OK" : "exact brand only"}</span>
              {search.watch ? (
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  <IconEye className="size-4" /> Watching
                </span>
              ) : null}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => sendToAgentChat({ message: "Summarise my results", submit: true, openSidebar: true })}
          >
            <IconSparkles className="size-4" /> Summarise for me
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            Asked <b>{counts.asked}</b>
          </span>
          <span>
            Replied <b>{replied}</b>
          </span>
          <span className="text-emerald-700 dark:text-emerald-300">
            In stock <b>{counts.inStock}</b>
          </span>
          {counts.alternative ? (
            <span className="text-amber-700 dark:text-amber-300">
              Alternative <b>{counts.alternative}</b>
            </span>
          ) : null}
          {counts.out ? (
            <span className="text-muted-foreground">
              Out <b>{counts.out}</b>
            </span>
          ) : null}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${replied} of ${total} replied`}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(replied / total) * 100}%` }} />
        </div>
        {search.rxRequired ? (
          <p className="mt-3 text-xs text-muted-foreground">Prescription medicine: bring your prescription. Rounds only finds stock.</p>
        ) : null}
      </header>

      {best ? (
        <section className="mt-4 flex flex-col gap-3 rounded-2xl bg-emerald-700 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base">
            <b>{best.pharmacy.name}</b> has it
            {best.latestReply?.priceNaira ? (
              <>
                : <b>{naira(best.latestReply.priceNaira)}</b>
              </>
            ) : null}
            , {best.pharmacy.distanceKm} km.
            {best.hold?.status === "confirmed" ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-sm">
                <IconPin className="size-4" /> Held for {best.hold.customerFirstName} until {best.hold.holdUntilLabel}
              </span>
            ) : null}
          </p>
          <div className="flex gap-2">
            {best.canHold ? (
              <Button className="bg-white text-emerald-900 hover:bg-emerald-50" onClick={() => setHoldAsk(best)}>
                <IconPin className="size-4" /> Hold it for me
              </Button>
            ) : null}
            <Button asChild variant="secondary" className="bg-white/15 text-white hover:bg-white/25">
              <a href={directionsUrl(best.pharmacy.lat, best.pharmacy.lng)} target="_blank" rel="noreferrer">
                <IconMapPin className="size-4" /> Directions
              </a>
            </Button>
          </div>
        </section>
      ) : null}

      {allOut ? (
        <section className="mt-4 rounded-2xl border border-dashed border-border bg-card p-5 text-center">
          <p className="text-lg font-semibold">No one has it yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">We can keep asking, ask further away, or think about what else to try.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              disabled={search.watch || updateSearch.isPending}
              onClick={() =>
                updateSearch.mutate(
                  { id, watch: true },
                  { onSuccess: () => toast.success("Watching: we'll ask again every 3 hours") },
                )
              }
            >
              <IconEye className="size-4" /> {search.watch ? "Watching" : "Watch this for me"}
            </Button>
            <Button variant="outline" disabled={widening} onClick={widen}>
              <IconWorldSearch className="size-4" /> {widening ? "Asking…" : "Widen to 10 km"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                sendToAgentChat({
                  message: `No pharmacy has ${search.drugLabel} near ${search.areaLabel}. What else can I try?`,
                  submit: true,
                  openSidebar: true,
                })
              }
            >
              <IconSparkles className="size-4" /> Ask Rounds what else to try
            </Button>
          </div>
        </section>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Sort">
          {(["best", "cheapest", "closest"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={sort === k}
              onClick={() => setSort(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize",
                sort === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        {!allOut ? (
          <Button variant="ghost" size="sm" disabled={widening} onClick={widen}>
            <IconWorldSearch className="size-4" /> {widening ? "Asking…" : "Ask more (10 km)"}
          </Button>
        ) : null}
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" style={{ perspective: "900px" }}>
        {asks.map((a) => (
          <AskCard
            key={a.id}
            ask={a}
            selected={selectedAskId === a.id}
            arrived={arrived.has(a.id)}
            acceptEquivalents={search.acceptEquivalents}
            drugLabel={search.drugLabel}
            onSelect={() => select(a)}
            onEdit={() => setEditAsk(a)}
            onHold={() => setHoldAsk(a)}
            onNudge={() => nudge.mutate({ askId: a.id })}
            onCancelHold={() => a.hold && cancelHold.mutate({ holdId: a.hold.id })}
            nudging={nudge.isPending && nudge.variables?.askId === a.id}
          />
        ))}
      </ul>

      <section className="mt-6 rounded-xl border border-border bg-card">
        <button
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
          onClick={() => setTimelineOpen((o) => !o)}
          aria-expanded={timelineOpen}
        >
          Activity ({data.timeline.length})
          <IconChevronDown className={cn("size-4 transition-transform", timelineOpen && "rotate-180")} />
        </button>
        {timelineOpen ? (
          <ol className="space-y-1.5 border-t border-border px-4 py-3 text-sm">
            {data.timeline.map((t, i) => (
              <li key={i} className="flex gap-3">
                <time className="w-16 shrink-0 tabular-nums text-muted-foreground">{t.time}</time>
                <span className="min-w-0">{t.text}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <EmergencyFooter />

      <EditSheet ask={editAsk} onClose={() => setEditAsk(null)} />
      <HoldSheet ask={holdAsk} drugLabel={search.drugLabel} onClose={() => setHoldAsk(null)} />

      {data.demoMode ? (
        <>
          <button
            onClick={() => setDevOpen(true)}
            className="fixed bottom-4 right-4 z-30 inline-flex md:bottom-5 md:right-auto md:left-[calc(var(--chat-sidebar-width)+1.25rem)] items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700"
          >
            <IconFlask className="size-4" /> <span className="hidden sm:inline">Simulate a reply</span><span className="sm:hidden">Simulate</span>
          </button>
          <DevPanel open={devOpen} onClose={() => setDevOpen(false)} asks={data.asks} />
        </>
      ) : null}
    </div>
  );
}

function AskCard({
  ask: a,
  selected,
  arrived,
  acceptEquivalents,
  drugLabel,
  onSelect,
  onEdit,
  onHold,
  onNudge,
  onCancelHold,
  nudging,
}: {
  ask: BoardAsk;
  selected: boolean;
  arrived: boolean;
  acceptEquivalents: boolean;
  drugLabel: string;
  onSelect: () => void;
  onEdit: () => void;
  onHold: () => void;
  onNudge: () => void;
  onCancelHold: () => void;
  nudging: boolean;
}) {
  const status = a.displayStatus as DisplayStatus;
  const r = a.latestReply;
  const tag = r ? sourceTag(r.source, r.confidence) : null;
  const TagIcon = tag?.icon;
  const held = a.hold?.status === "confirmed";
  const holdPending = a.hold?.status === "requested";
  const showReply = r && status !== "reading";

  return (
    <li
      onClick={onSelect}
      onFocus={onSelect}
      tabIndex={0}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-xl border-2 bg-card p-4 outline-none transition-shadow",
        status === "in_stock" ? "border-emerald-300 dark:border-emerald-700" : "",
        status === "alternative" ? "border-amber-300 dark:border-amber-700" : "",
        status === "unclear" ? "border-violet-300 dark:border-violet-700" : "",
        status === "reading" ? "border-sky-300 dark:border-sky-700" : "",
        status === "silent" ? "border-dashed border-muted-foreground/40" : "",
        ["asked", "queued", "out_of_stock", "send_failed", "cancelled"].includes(status) ? "border-border" : "",
        status === "out_of_stock" ? "opacity-85" : "",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        arrived && "rounds-arrive",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">
            {a.pharmacy.name} {a.pharmacy.isVirtual ? <DemoBadge /> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {a.pharmacy.areaName} · {a.pharmacy.distanceKm} km
            {a.sentAgo ? ` · asked ${a.sentAgo}` : ""}
          </p>
        </div>
        <StatusChip status={status} className="shrink-0" />
      </div>

      {held ? (
        <div className="mt-2">
          <HeldRibbon name={a.hold!.customerFirstName} until={a.hold!.holdUntilLabel} />
        </div>
      ) : holdPending ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-300">
          <span className="rounds-pulse-dot size-1.5 rounded-full bg-sky-500" /> Hold for {a.hold!.customerFirstName}: waiting for pharmacy…
        </p>
      ) : a.hold?.status === "declined" ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground">Hold declined by pharmacy</p>
      ) : null}

      <div className="mt-3 min-h-[3.5rem] flex-1 space-y-1.5">
        {showReply ? (
          <>
            {r.priceNaira && (status === "in_stock" || status === "alternative") ? (
              <p className="text-2xl font-bold tabular-nums">{naira(r.priceNaira)}</p>
            ) : null}
            {r.quantity ? <p className="text-sm">{r.quantity} left</p> : null}
            {status === "alternative" && r.alternativeText ? (
              <p className="text-sm">
                <span className="font-medium">Instead:</span> {r.alternativeText}
              </p>
            ) : null}
            {status === "out_of_stock" ? (
              <p className="text-sm text-muted-foreground">{r.restockEta ? `Back ${r.restockEta}` : "Out of stock"}</p>
            ) : null}
            {status === "unclear" ? <p className="text-sm text-muted-foreground">Rounds is checking with them.</p> : null}
          </>
        ) : status === "reading" ? (
          <p className="text-sm text-sky-800 dark:text-sky-200">Rounds is reading their reply…</p>
        ) : status === "silent" ? (
          <p className="text-sm text-muted-foreground">No reply yet{a.nudgeCount ? ` · nudged ${a.nudgeCount}×` : ""}.</p>
        ) : status === "send_failed" ? (
          <p className="text-sm text-muted-foreground">Couldn't reach this pharmacy.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for their reply…</p>
        )}

        {a.lastInboundText ? (
          <div className="relative mt-2 max-w-full rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
            <span className="block break-words">“{a.lastInboundText}”</span>
          </div>
        ) : null}
        {tag && TagIcon && status !== "reading" ? (
          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <TagIcon className="size-3.5" /> {tag.text}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {a.canHold ? (
          <Button size="sm" onClick={onHold}>
            <IconPin className="size-4" /> Hold
          </Button>
        ) : null}
        {held || holdPending ? (
          <Button size="sm" variant="outline" onClick={onCancelHold}>
            Cancel hold
          </Button>
        ) : null}
        {status === "alternative" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              sendToAgentChat({
                message: `Is ${r?.alternativeText ?? "this alternative"} at ${a.pharmacy.name} OK instead of ${drugLabel}?`,
                context: `Original request: ${drugLabel}. Equivalents accepted: ${acceptEquivalents ? "yes" : "no"}. Pharmacy offered: ${r?.alternativeText ?? a.lastInboundText ?? "unknown"}. Ask id: ${a.id}. Only same active ingredient, strength and form counts as equivalent; tell the user to confirm with their pharmacist.`,
                contextLabel: `${a.pharmacy.name} alternative`,
                submit: true,
                openSidebar: true,
              })
            }
          >
            <IconMessageQuestion className="size-4" /> Is this OK?
          </Button>
        ) : null}
        {a.canNudge ? (
          <Button size="sm" variant="outline" disabled={nudging} onClick={onNudge}>
            <IconBell className="size-4" /> {nudging ? "Nudging…" : "Nudge"}
          </Button>
        ) : null}
        {a.latestReply || a.lastInboundText ? (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <IconPencil className="size-4" /> Edit
          </Button>
        ) : null}
        {a.pharmacy.phone ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={`tel:${a.pharmacy.phone}`}>
              <IconPhone className="size-4" /> Call
            </a>
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" asChild>
          <a href={directionsUrl(a.pharmacy.lat, a.pharmacy.lng)} target="_blank" rel="noreferrer">
            <IconMapPin className="size-4" /> Directions
          </a>
        </Button>
      </div>
    </li>
  );
}

const AVAIL: Array<{ v: "in_stock" | "out_of_stock" | "alternative" | "unclear"; label: string }> = [
  { v: "in_stock", label: "In stock" },
  { v: "out_of_stock", label: "Out" },
  { v: "alternative", label: "Alternative" },
  { v: "unclear", label: "Unclear" },
];

function EditSheet({ ask, onClose }: { ask: BoardAsk | null; onClose: () => void }) {
  const [availability, setAvailability] = useState<(typeof AVAIL)[number]["v"]>("in_stock");
  const [price, setPrice] = useState("");
  const [alt, setAlt] = useState("");
  const [eta, setEta] = useState("");
  useEffect(() => {
    if (!ask) return;
    const r = ask.latestReply;
    setAvailability((r?.availability as typeof availability) ?? "in_stock");
    setPrice(r?.priceNaira ? String(r.priceNaira) : "");
    setAlt(r?.alternativeText ?? "");
    setEta(r?.restockEta ?? "");
  }, [ask]);
  const save = useActionMutation("record-reply", {
    onSuccess: () => {
      toast.success("Updated. Rounds will use your correction.");
      onClose();
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't save"),
  });
  const priceNum = price ? Number(price.replace(/[^\d]/g, "")) : undefined;
  return (
    <Sheet open={Boolean(ask)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-lg rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Correct {ask?.pharmacy.name}</SheetTitle>
          <SheetDescription>
            {ask?.lastInboundText ? `They said: “${ask.lastInboundText}”` : "Fix what Rounds recorded."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="space-y-4 px-4 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ask) return;
            save.mutate({
              askId: ask.id,
              availability,
              ...(priceNum && priceNum >= 50 ? { priceNaira: priceNum } : {}),
              ...(availability === "alternative" && alt.trim() ? { alternativeText: alt.trim() } : {}),
              ...(availability === "out_of_stock" && eta.trim() ? { restockEta: eta.trim() } : {}),
              ...(ask.lastInboundText ? { rawText: ask.lastInboundText } : {}),
              source: "user_edit",
            });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {AVAIL.map((o) => (
              <button
                type="button"
                key={o.v}
                onClick={() => setAvailability(o.v)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-medium",
                  availability === o.v ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {availability === "in_stock" || availability === "alternative" ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-price">Price (₦)</Label>
              <Input id="edit-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="3500" />
            </div>
          ) : null}
          {availability === "alternative" ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-alt">What they have instead</Label>
              <Input id="edit-alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} />
            </div>
          ) : null}
          {availability === "out_of_stock" ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-eta">Back in stock (optional)</Label>
              <Input id="edit-eta" value={eta} onChange={(e) => setEta(e.target.value)} maxLength={60} placeholder="Thursday" />
            </div>
          ) : null}
          <Button type="submit" className="h-12 w-full rounded-xl" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function defaultHoldTime(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const lagos = new Date(d.getTime() + 60 * 60 * 1000); // UTC+1 wall clock
  const h = Math.min(23, lagos.getUTCHours());
  return `${String(h).padStart(2, "0")}:${String(lagos.getUTCMinutes() < 30 ? 0 : 30).padStart(2, "0")}`;
}

function HoldSheet({ ask, drugLabel, onClose }: { ask: BoardAsk | null; drugLabel: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [until, setUntil] = useState(defaultHoldTime);
  useEffect(() => {
    if (ask) setUntil(defaultHoldTime());
  }, [ask]);
  const hold = useActionMutation("request-hold", {
    onSuccess: (r) => {
      toast.success(`Hold requested at ${r.pharmacyName}. Waiting for them to confirm…`);
      onClose();
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't request the hold"),
  });
  return (
    <Sheet open={Boolean(ask)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-lg rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Hold at {ask?.pharmacy.name}</SheetTitle>
          <SheetDescription>
            We'll ask them to set aside {drugLabel}. They only see your first name.
          </SheetDescription>
        </SheetHeader>
        <form
          className="space-y-4 px-4 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ask || !name.trim()) return;
            hold.mutate({ askId: ask.id, customerFirstName: name.trim(), holdUntil: until, quantity: 1 });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="hold-name">Your first name</Label>
            <Input id="hold-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-until">Hold until (today)</Label>
            <Input id="hold-until" type="time" value={until} onChange={(e) => setUntil(e.target.value)} required />
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl" disabled={hold.isPending || !name.trim()}>
            <IconPin className="size-4" /> {hold.isPending ? "Sending…" : "Ask them to hold it"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function DevPanel({ open, onClose, asks }: { open: boolean; onClose: () => void; asks: BoardAsk[] }) {
  const [askId, setAskId] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    if (open && !askId && asks[0]) setAskId(asks[0].id);
  }, [open, asks, askId]);
  const sim = useActionMutation("simulate-pharmacy-reply", {
    onSuccess: () => {
      toast.success("Message delivered as if from Telegram");
      setText("");
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't simulate"),
  });
  const ask = asks.find((a) => a.id === askId);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-lg rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Simulate a pharmacist reply</SheetTitle>
          <SheetDescription>Goes through the same inbound pipeline as a real Telegram message.</SheetDescription>
        </SheetHeader>
        <form
          className="space-y-3 px-4 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (askId && text.trim()) sim.mutate({ askId, text: text.trim() });
          }}
        >
          <select value={askId} onChange={(e) => setAskId(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3">
            {asks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.pharmacy.name} ({a.displayStatus})
              </option>
            ))}
          </select>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="we get am, 3.5k" />
          <div className="flex flex-wrap gap-1.5">
            {["we get am 3500", "e don finish o, maybe Thursday", "no but we get asthalin 3k", "abeg which strength?"].map((t) => (
              <button key={t} type="button" className="rounded-full border border-border px-2.5 py-1 text-xs" onClick={() => setText(t)}>
                {t}
              </button>
            ))}
          </div>
          {ask?.replyLinkToken ? (
            <a className="block text-xs text-primary underline" href={`/r/${ask.replyLinkToken}`} target="_blank" rel="noreferrer">
              <IconRefresh className="mr-1 inline size-3.5" />
              Open this pharmacy's reply-link page
            </a>
          ) : null}
          <Button type="submit" className="w-full" disabled={sim.isPending || !text.trim()}>
            {sim.isPending ? "Sending…" : "Send as pharmacist"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
