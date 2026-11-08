import {
  actionErrorMessage,
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconBrandTelegram, IconCopy, IconPlus, IconQrcode } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/rounds/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function meta() {
  return [{ title: "Rounds · Pharmacies" }];
}

type ConnectLink = { deepLink: string | null; qrDataUrl: string | null; connectCode: string; configured: boolean; connected: boolean };

export default function PharmaciesRoute() {
  const list = useActionQuery("list-pharmacies", {}, { refetchInterval: 10_000 });
  const areas = useActionQuery("list-areas", {});
  const [qr, setQr] = useState<{ name: string; link: ConnectLink } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("area_rumuola");
  const [phone, setPhone] = useState("");

  const upsert = useActionMutation("upsert-pharmacy", {
    onSuccess: () => {
      toast.success("Pharmacy added. Share its connect link so they can link Telegram.");
      setAdding(false);
      setName("");
      setPhone("");
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't save"),
  });

  async function link(id: string, nameForTitle: string, mode: "copy" | "qr") {
    try {
      const r = (await callAction("get-pharmacy-connect-link", { id })) as ConnectLink;
      if (!r.configured || !r.deepLink) {
        toast.error(`Telegram bot isn't configured yet. Connect code: ${r.connectCode}`);
        return;
      }
      if (mode === "copy") {
        await navigator.clipboard.writeText(r.deepLink).catch(() => undefined);
        toast.success("Connect link copied");
      } else setQr({ name: nameForTitle, link: r });
    } catch (e) {
      toast.error(actionErrorMessage(e) ?? "Couldn't get the link");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          <IconBrandTelegram className="size-4 text-sky-600" /> Pharmacies connect once
        </p>
        <p className="mt-1 text-muted-foreground">
          Send a pharmacist their connect link (or show the QR code). They tap Start in Telegram, and from then on Rounds can
          ask them about stock. They never need to open this app. Demo pharmacies reply automatically.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Directory</h1>
        <Button size="sm" onClick={() => setAdding((a) => !a)}>
          <IconPlus className="size-4" /> Add pharmacy
        </Button>
      </div>

      {adding ? (
        <form
          className="mt-3 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            upsert.mutate({ name: name.trim(), areaId, ...(phone.trim() ? { phone: phone.trim() } : {}) });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ph-name">Name</Label>
            <Input id="ph-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-area">Area</Label>
            <select id="ph-area" value={areaId} onChange={(e) => setAreaId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              {(areas.data?.areas ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}, {a.city}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-phone">Phone</Label>
            <Input id="ph-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
          </div>
          <Button type="submit" disabled={upsert.isPending || name.trim().length < 2}>
            Save
          </Button>
        </form>
      ) : null}

      {list.isPending ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {(list.data?.pharmacies ?? []).map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium">
                  <span className="truncate">{p.name}</span>
                  {p.isVirtual ? <DemoBadge /> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.areaName}, {p.city}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.isVirtual ? (
                  <span className="text-xs text-muted-foreground">Auto-replies</span>
                ) : p.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                    <IconBrandTelegram className="size-3.5" /> Connected{p.telegramUsername ? ` · @${p.telegramUsername}` : ""}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Not connected</span>
                )}
                {!p.isVirtual ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => link(p.id, p.name, "copy")}>
                      <IconCopy className="size-4" /> Copy link
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Show QR code" onClick={() => link(p.id, p.name, "qr")}>
                      <IconQrcode className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(qr)} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect {qr?.name}</DialogTitle>
            <DialogDescription>Scan with the pharmacy's phone, then tap Start in Telegram.</DialogDescription>
          </DialogHeader>
          {qr?.link.qrDataUrl ? <img src={qr.link.qrDataUrl} alt="Telegram connect QR code" className="mx-auto size-64 rounded-lg bg-white p-2" /> : null}
          <p className="break-all text-center text-xs text-muted-foreground">{qr?.link.deepLink}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
