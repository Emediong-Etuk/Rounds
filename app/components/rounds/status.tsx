import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconHelpCircle,
  IconHourglassLow,
  IconMessageCircle,
  IconPin,
  IconRefresh,
  IconZzz,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type DisplayStatus =
  | "asked"
  | "reading"
  | "in_stock"
  | "out_of_stock"
  | "alternative"
  | "unclear"
  | "silent"
  | "send_failed"
  | "queued"
  | "cancelled";

export const STATUS_META: Record<
  DisplayStatus,
  { label: string; icon: typeof IconCircleCheck; chip: string; card: string }
> = {
  in_stock: {
    label: "In stock",
    icon: IconCircleCheck,
    chip: "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:ring-emerald-700",
    card: "border-emerald-300 dark:border-emerald-700",
  },
  alternative: {
    label: "Has alternative",
    icon: IconRefresh,
    chip: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-700",
    card: "border-amber-300 dark:border-amber-700",
  },
  out_of_stock: {
    label: "Out",
    icon: IconCircleX,
    chip: "bg-zinc-100 text-zinc-700 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600",
    card: "border-border opacity-80",
  },
  unclear: {
    label: "Unclear",
    icon: IconHelpCircle,
    chip: "bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-900/40 dark:text-violet-100 dark:ring-violet-700",
    card: "border-violet-300 dark:border-violet-700",
  },
  reading: {
    label: "Reading reply…",
    icon: IconMessageCircle,
    chip: "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:ring-sky-700",
    card: "border-sky-300 dark:border-sky-700",
  },
  asked: {
    label: "Asked",
    icon: IconHourglassLow,
    chip: "bg-muted text-muted-foreground ring-border",
    card: "border-border",
  },
  queued: {
    label: "Sending…",
    icon: IconHourglassLow,
    chip: "bg-muted text-muted-foreground ring-border",
    card: "border-border",
  },
  silent: {
    label: "Silent",
    icon: IconZzz,
    chip: "bg-background text-muted-foreground ring-border ring-dashed",
    card: "border-dashed border-muted-foreground/40",
  },
  send_failed: {
    label: "Couldn't send",
    icon: IconAlertTriangle,
    chip: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-800",
    card: "border-red-200 dark:border-red-900 opacity-80",
  },
  cancelled: {
    label: "Cancelled",
    icon: IconCircleX,
    chip: "bg-muted text-muted-foreground ring-border",
    card: "border-border opacity-60",
  },
};

export function StatusChip({ status, className }: { status: DisplayStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        meta.chip,
        className,
      )}
    >
      {status === "reading" ? (
        <span className="rounds-pulse-dot size-1.5 rounded-full bg-sky-500" aria-hidden />
      ) : (
        <Icon className="size-3.5" strokeWidth={2.2} aria-hidden />
      )}
      {meta.label}
    </span>
  );
}

export function HeldRibbon({ name, until }: { name: string; until: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
      <IconPin className="size-3.5" aria-hidden /> Held for {name} until {until}
    </span>
  );
}

const nairaFmt = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function naira(n: number | null | undefined): string {
  return typeof n === "number" ? nairaFmt.format(n) : "";
}

export function lagosTime(ms: number): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function timeAgo(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function RxBadge({ className }: { className?: string }) {
  return (
    <span
      title="Prescription needed. Pharmacies will ask for your prescription."
      className={cn(
        "inline-flex items-center rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-rose-800 ring-1 ring-inset ring-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800",
        className,
      )}
    >
      Rx
    </span>
  );
}

export function DemoBadge() {
  return (
    <span
      title="Demo pharmacy: replies automatically so you can try Rounds without Telegram."
      className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-800"
    >
      Demo
    </span>
  );
}

export function EmergencyFooter() {
  return (
    <p className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
      In an emergency, go to the nearest hospital or call <a className="font-semibold underline" href="tel:112">112</a>.
      Rounds only finds stock; it doesn't sell, dispense or give medical advice.
    </p>
  );
}
