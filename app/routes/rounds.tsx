import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconArrowRight,
  IconBolt,
  IconCurrentLocation,
  IconMessageChatbot,
  IconPill,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import {
  DemoBadge,
  EmergencyFooter,
  naira,
  RxBadge,
  StatusChip,
  timeAgo,
} from "@/components/rounds/status";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function meta() {
  return [
    { title: "Rounds · Which pharmacy has my medicine?" },
    { name: "description", content: "We do the pharmacy rounds so you don't have to." },
  ];
}

type DrugMatch = {
  id: string;
  genericName: string;
  strength: string | null;
  form: string;
  brandNames: string[];
  rxRequired: boolean;
  controlled: boolean;
  drugKey: string;
  label: string;
};

type Origin = { area?: string; lat?: number; lng?: number; label: string };

function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const QUICK_PROMPTS = [
  "Find a Ventolin inhaler near Rumuola",
  "Coartem near Ewet Housing, Uyo",
  "I need Augmentin 625 around GRA Phase 2",
];

export default function RoundsHome() {
  const [query, setQuery] = useState("");
  const [areaName, setAreaName] = useState("Rumuola");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickedDrug, setPickedDrug] = useState<DrugMatch | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const debounced = useDebounced(query.trim());

  const areas = useActionQuery("list-areas", {});
  const matches = useActionQuery(
    "resolve-drug",
    { query: debounced },
    { enabled: debounced.length >= 2, staleTime: 60_000 },
  );
  const recent = useActionQuery("list-searches", { limit: 6 }, { refetchInterval: 15_000 });

  const suggestions = (matches.data?.matches ?? []) as DrugMatch[];
  const origin: Origin = geo
    ? { lat: geo.lat, lng: geo.lng, label: "your location" }
    : { area: areaName, label: areaName };

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Your browser can't share location. Pick your area instead.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoBusy(false);
        toast.success("Using your location");
      },
      () => {
        setGeoBusy(false);
        toast.error("Couldn't get your location. Pick your area instead.");
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  }

  function findIt(drug?: DrugMatch) {
    const d = drug ?? suggestions[0];
    if (!d) {
      toast.error(query.trim() ? "I couldn't find that medicine. Try the brand or generic name, or ask Rounds in chat." : "Type a medicine first.");
      return;
    }
    setSuggestOpen(false);
    setPickedDrug(d);
    setSheetOpen(true);
  }

  const cities = useMemo(() => {
    const list = areas.data?.areas ?? [];
    return ["Port Harcourt", "Uyo"].map((c) => ({ city: c, areas: list.filter((a) => a.city === c) }));
  }, [areas.data]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <section className="rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-800 px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
          <IconPill className="size-3.5" /> Rounds · Port Harcourt & Uyo
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Which pharmacy has my medicine?</h1>
        <p className="mt-1.5 text-emerald-100">We do the pharmacy rounds so you don't have to.</p>

        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            findIt();
          }}
        >
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSuggestOpen(false);
              }}
              placeholder="e.g. Ventolin inhaler, Coartem, Amoxil 500mg"
              aria-label="Medicine"
              autoComplete="off"
              className="h-12 rounded-xl border-0 bg-white pl-10 text-base text-zinc-900 placeholder:text-zinc-400"
            />
            {suggestOpen && debounced.length >= 2 && suggestions.length > 0 ? (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
                {suggestions.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => findIt(m)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{m.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {m.brandNames.length ? m.brandNames.join(", ") : "Generic"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {m.controlled ? (
                          <span className="text-xs text-muted-foreground">Not searchable</span>
                        ) : m.rxRequired ? (
                          <RxBadge />
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Area"
              value={geo ? "__geo" : areaName}
              onChange={(e) => {
                if (e.target.value === "__geo") return;
                setGeo(null);
                setAreaName(e.target.value);
              }}
              className="h-12 flex-1 rounded-xl border-0 bg-white px-3 text-base text-zinc-900"
            >
              {geo ? <option value="__geo">📍 Your location</option> : null}
              {cities.map((c) => (
                <optgroup key={c.city} label={c.city}>
                  {c.areas.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              className="h-12 rounded-xl bg-white/15 text-white hover:bg-white/25"
              onClick={useMyLocation}
              disabled={geoBusy}
            >
              <IconCurrentLocation className="size-4" />
              {geoBusy ? "Locating…" : "Use my location"}
            </Button>
            <Button type="submit" className="h-12 rounded-xl bg-white px-6 text-base font-semibold text-emerald-900 hover:bg-emerald-50">
              Find it <IconArrowRight className="size-4" />
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <IconSparkles className="size-3.5" /> Or just tell Rounds
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => sendToAgentChat({ message: p, submit: true, openSidebar: true })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50 hover:bg-accent"
            >
              <IconMessageChatbot className="size-4 text-primary" /> {p}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Recent searches</h2>
        {recent.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : recent.data?.searches.length ? (
          <ul className="space-y-2">
            {recent.data.searches.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/s/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.drugLabel}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.areaLabel} · {timeAgo(s.createdAt)} · {s.summaryLine}
                    </span>
                  </span>
                  <span className="shrink-0">
                    {s.best ? (
                      <StatusChip status="in_stock" />
                    ) : s.counts.pending > 0 ? (
                      <StatusChip status="asked" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{s.watch ? "Watching" : "No stock yet"}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No searches yet. Try "Ventolin" near Rumuola: demo pharmacies reply in under a minute.
          </p>
        )}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { n: "1", t: "Tell us the medicine", d: "Brand or generic. We confirm the exact strength and form." },
          { n: "2", t: "We ask every pharmacy at once", d: "Pharmacists reply on Telegram in their own words. Rounds AI reads them." },
          { n: "3", t: "Pick, hold, go", d: "See who has it and the price, then ask them to set it aside for you." },
        ].map((s) => (
          <div key={s.n} className="rounded-xl border border-border bg-card p-4">
            <span className="mb-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {s.n}
            </span>
            <p className="font-semibold">{s.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      <EmergencyFooter />

      <ConfirmSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        drug={pickedDrug}
        alternatives={suggestions}
        onPickDrug={setPickedDrug}
        origin={origin}
        rawQuery={query.trim() || pickedDrug?.label || ""}
      />
    </div>
  );
}

function ConfirmSheet({
  open,
  onOpenChange,
  drug,
  alternatives,
  onPickDrug,
  origin,
  rawQuery,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  drug: DrugMatch | null;
  alternatives: DrugMatch[];
  onPickDrug: (d: DrugMatch) => void;
  origin: Origin;
  rawQuery: string;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [acceptEquivalents, setAcceptEquivalents] = useState(true);
  const [radiusKm, setRadiusKm] = useState(5);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setStep(1);
  }, [open, drug?.id]);

  const params = {
    ...(origin.area ? { area: origin.area } : {}),
    ...(origin.lat !== undefined ? { lat: origin.lat, lng: origin.lng } : {}),
    radiusKm,
    limit: 15,
    ...(drug ? { drugKey: drug.drugKey } : {}),
  };
  const found = useActionQuery("find-pharmacies", params, { enabled: open && step === 2 && Boolean(drug) });
  const pharmacies = found.data?.pharmacies ?? [];

  useEffect(() => {
    if (found.data) setSelected(new Set(found.data.pharmacies.slice(0, 8).map((p) => p.id)));
  }, [found.data]);

  const start = useActionMutation("start-search", {
    onSuccess: (r) => {
      onOpenChange(false);
      if (r.failed.length) toast.message(`${r.failed.length} pharmacy couldn't be reached`);
      navigate(`/s/${r.searchId}`);
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't start the search"),
  });

  const siblings = alternatives.filter((a) => drug && a.id !== drug.id && a.genericName === drug.genericName);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{step === 1 ? "Is this the right medicine?" : "Which pharmacies should we ask?"}</SheetTitle>
          <SheetDescription>Step {step} of 2 · near {origin.label}</SheetDescription>
        </SheetHeader>

        {drug && step === 1 ? (
          <div className="space-y-4 px-4 pb-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{drug.label}</p>
                  <p className="text-sm text-muted-foreground">{drug.genericName}</p>
                </div>
                {drug.rxRequired ? <RxBadge /> : null}
              </div>
              {drug.brandNames.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {drug.brandNames.map((b) => (
                    <span key={b} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {b}
                    </span>
                  ))}
                </div>
              ) : null}
              {drug.rxRequired && !drug.controlled ? (
                <p className="mt-3 text-sm text-rose-800 dark:text-rose-200">
                  This needs a prescription. Pharmacies will ask to see it.
                </p>
              ) : null}
            </div>

            {drug.controlled ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                Rounds can't search for controlled or abuse-prone medicines like this one. Please speak to your doctor or a
                pharmacist in person, who can help you safely.
              </div>
            ) : (
              <>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                  <span>
                    <span className="block font-medium">Accept equivalents</span>
                    <span className="block text-sm text-muted-foreground">
                      Same ingredient and strength, any brand. Confirm with your pharmacist.
                    </span>
                  </span>
                  <Switch checked={acceptEquivalents} onCheckedChange={setAcceptEquivalents} />
                </label>
                {siblings.length ? (
                  <div>
                    <p className="mb-1.5 text-sm font-medium">Not this? Pick another strength</p>
                    <div className="flex flex-wrap gap-2">
                      {siblings.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onPickDrug(s)}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary/50"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Check your prescription or the box if you're not sure.</p>
                  </div>
                ) : null}
                <Button className="h-12 w-full rounded-xl text-base" onClick={() => setStep(2)}>
                  Yes, find pharmacies <IconArrowRight className="size-4" />
                </Button>
              </>
            )}
          </div>
        ) : null}

        {drug && step === 2 ? (
          <div className="space-y-3 px-4 pb-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Within</Label>
              {[2, 5, 10].map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => setRadiusKm(km)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    radiusKm === km ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {km} km
                </button>
              ))}
            </div>
            {found.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : found.isError ? (
              <p className="rounded-xl border border-dashed p-4 text-sm">{actionErrorMessage(found.error) ?? "Couldn't load pharmacies."}</p>
            ) : pharmacies.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm">
                No reachable pharmacies within {radiusKm} km.{" "}
                {radiusKm < 10 ? (
                  <button className="font-semibold text-primary underline" onClick={() => setRadiusKm(10)}>
                    Widen to 10 km
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-2">
                {pharmacies.map((p) => {
                  const on = selected.has(p.id);
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border p-3",
                          on ? "border-primary/60 bg-primary/5" : "border-border",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-5 accent-[hsl(var(--primary))]"
                          checked={on}
                          onChange={() => {
                            const next = new Set(selected);
                            if (on) next.delete(p.id);
                            else if (next.size < 15) next.add(p.id);
                            setSelected(next);
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{p.name}</span>
                            {p.isVirtual ? <DemoBadge /> : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.areaName} · {p.distanceKm} km
                          </span>
                        </span>
                        {p.lastKnown && p.lastKnown.availability === "in_stock" ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800">
                            Had it {p.lastKnown.ago}
                            {p.lastKnown.priceNaira ? ` · ${naira(p.lastKnown.priceNaira)}` : ""}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="h-12 flex-1 rounded-xl text-base"
                disabled={selected.size === 0 || start.isPending}
                onClick={() =>
                  start.mutate({
                    rawQuery: rawQuery || drug.label,
                    drug: {
                      drugId: drug.id,
                      label: drug.label,
                      genericName: drug.genericName,
                      ...(drug.strength ? { strength: drug.strength } : {}),
                      form: drug.form,
                      rxRequired: drug.rxRequired,
                    },
                    acceptEquivalents,
                    origin: {
                      ...(origin.area ? { area: origin.area } : {}),
                      ...(origin.lat !== undefined ? { lat: origin.lat, lng: origin.lng } : {}),
                    },
                    radiusKm,
                    pharmacyIds: [...selected],
                  })
                }
              >
                <IconBolt className="size-4" />
                {start.isPending ? "Asking…" : `Ask ${selected.size} pharmac${selected.size === 1 ? "y" : "ies"}`}
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
