// The pharmacist's reply-link page: plain server-rendered HTML, no JS,
// inline CSS, fast on a cheap phone on 3G. The token is the credential.
// No customer data is shown.

import { runWithRequestContext } from "@agent-native/core/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../../db/index.js";
import { MAX_LINK_SUBMISSIONS, REPLY_TOKEN_TTL_MS } from "./config.js";
import { recordReplyCore } from "./core.js";
import { brandLine, esc } from "./messages.js";
import { formatNaira, lagosTime } from "./ranking.js";

type LinkContext = {
  ask: typeof schema.asks.$inferSelect;
  search: typeof schema.searches.$inferSelect;
  pharmacy: typeof schema.pharmacies.$inferSelect;
  latest?: typeof schema.replies.$inferSelect | undefined;
};

export async function loadByToken(token: string): Promise<LinkContext | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = getDb();
  const [ask] = await db.select().from(schema.asks).where(eq(schema.asks.replyToken, token)).limit(1);
  if (!ask) return null;
  const [[search], [pharmacy], [latest]] = await Promise.all([
    db.select().from(schema.searches).where(and(eq(schema.searches.id, ask.searchId), eq(schema.searches.ownerEmail, ask.ownerEmail))).limit(1),
    db.select().from(schema.pharmacies).where(eq(schema.pharmacies.id, ask.pharmacyId)).limit(1),
    db.select().from(schema.replies).where(and(eq(schema.replies.askId, ask.id), eq(schema.replies.ownerEmail, ask.ownerEmail))).orderBy(desc(schema.replies.createdAt)).limit(1),
  ]);
  if (!search || !pharmacy) return null;
  return { ask, search, pharmacy, latest };
}

export function isExpired(ctx: LinkContext, now = Date.now()) {
  return now - (ctx.ask.sentAt ?? ctx.ask.createdAt) > REPLY_TOKEN_TTL_MS || ctx.search.status === "cancelled";
}

const formSchema = z.object({
  availability: z.enum(["in_stock", "out_of_stock", "alternative"]),
  price: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(/[^\d]/g, "")) : undefined))
    .refine((v) => v === undefined || (v >= 50 && v <= 2_000_000), "Price must be between ₦50 and ₦2,000,000"),
  quantity: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(/[^\d]/g, "")) : undefined))
    .refine((v) => v === undefined || (v >= 1 && v <= 1000), "Quantity must be 1-1000"),
  alternative: z.string().max(200).optional(),
  restock: z.string().max(60).optional(),
});

export async function submitLinkReply(token: string, form: Record<string, string>) {
  const ctx = await loadByToken(token);
  if (!ctx) return { kind: "not_found" as const };
  if (isExpired(ctx)) return { kind: "expired" as const, ctx };
  if (ctx.ask.linkSubmissionCount >= MAX_LINK_SUBMISSIONS) return { kind: "limit" as const, ctx };
  const parsed = formSchema.safeParse(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || undefined])));
  if (!parsed.success) return { kind: "invalid" as const, ctx, error: parsed.error.issues[0]?.message ?? "Please check the form" };
  const f = parsed.data;

  await getDb()
    .update(schema.asks)
    .set({ linkSubmissionCount: ctx.ask.linkSubmissionCount + 1 })
    .where(eq(schema.asks.id, ctx.ask.id));

  const rawText = [
    f.availability === "in_stock" ? "In stock" : f.availability === "out_of_stock" ? "Out of stock" : "Alternative",
    f.price ? formatNaira(f.price) : "",
    f.quantity ? `${f.quantity} left` : "",
    f.alternative ?? "",
    f.restock ? `back ${f.restock}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  await runWithRequestContext({ userEmail: ctx.ask.ownerEmail }, () =>
    recordReplyCore(ctx.ask.ownerEmail, {
      askId: ctx.ask.id,
      availability: f.availability,
      priceNaira: f.availability === "out_of_stock" ? undefined : f.price,
      quantity: f.availability === "out_of_stock" ? undefined : f.quantity,
      alternativeText: f.availability === "alternative" ? f.alternative : undefined,
      restockEta: f.availability === "out_of_stock" ? f.restock : undefined,
      rawText: `(reply link) ${rawText}`,
      source: "link",
      confidence: 1,
      notifyPharmacy: false,
    }),
  );
  return { kind: "ok" as const, ctx };
}

// ── HTML ───────────────────────────────────────────────────────────────────

const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f6f4;color:#14231b}
.w{max-width:480px;margin:0 auto;padding:16px}.top{background:#0f5132;color:#fff;padding:14px 16px;font-weight:700;letter-spacing:.2px}
.top small{display:block;font-weight:400;opacity:.85}.card{background:#fff;border:1px solid #dce5df;border-radius:14px;padding:16px;margin-top:14px}
h1{font-size:20px;margin:0 0 6px}.muted{color:#5b6b62;font-size:14px}.opt{display:block;border:2px solid #dce5df;border-radius:12px;padding:14px;margin:10px 0;font-weight:600;font-size:17px}
.opt input{width:22px;height:22px;vertical-align:middle;margin-right:10px;accent-color:#0f5132}label.f{display:block;font-weight:600;margin:14px 0 4px}
input[type=text],input[type=number]{width:100%;font-size:17px;padding:12px;border:1px solid #b9c8bf;border-radius:10px}
button{width:100%;margin-top:18px;padding:15px;font-size:18px;font-weight:700;color:#fff;background:#0f5132;border:0;border-radius:12px}
.ok{background:#e6f4ea;border-color:#9bd3ae}.err{background:#fdecea;border-color:#f5b5ad;color:#7a1d12}.pill{display:inline-block;background:#e6f4ea;border-radius:99px;padding:2px 10px;font-size:13px;font-weight:600;color:#0f5132}`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="top">Rounds<small>Pharmacy stock check</small></div><div class="w">${body}</div></body></html>`;
}

export function renderMessagePage(title: string, message: string, cls = "") {
  return page(title, `<div class="card ${cls}"><h1>${esc(title)}</h1><p>${esc(message)}</p></div>`);
}

export function renderForm(ctx: LinkContext, opts: { error?: string; done?: boolean } = {}) {
  const { search, pharmacy, ask, latest } = ctx;
  const brands = (() => {
    try {
      return JSON.parse(search.brandNames) as string[];
    } catch {
      return [];
    }
  })();
  const current = latest
    ? `<p class="muted">Your last answer: <span class="pill">${esc(
        latest.availability === "in_stock" ? "In stock" : latest.availability === "out_of_stock" ? "Out of stock" : latest.availability === "alternative" ? "Alternative" : "Unclear",
      )}${latest.priceNaira ? ` · ${esc(formatNaira(latest.priceNaira))}` : ""}</span> You can update it below.</p>`
    : "";
  const banner = opts.done
    ? `<div class="card ok"><h1>Thank you! 🙏</h1><p>The customer can see your answer now.</p></div>`
    : opts.error
      ? `<div class="card err">${esc(opts.error)}</div>`
      : "";
  const area = search.areaLabel.replace(/^near\s+/i, "");
  return page(
    `Stock check for ${pharmacy.name}`,
    `${banner}<div class="card"><p class="muted">Stock check for <b>${esc(pharmacy.name)}</b></p>
<h1>${esc(search.drugLabel)}</h1>
<p class="muted">${esc(brandLine({ brandNames: brands, acceptEquivalents: search.acceptEquivalents }))}<br>Customer near ${esc(area)} · asked ${esc(lagosTime(ask.sentAt ?? ask.createdAt))}</p>${current}</div>
<form class="card" method="post" action="/api/r/${encodeURIComponent(ask.replyToken)}">
<label class="opt"><input type="radio" name="availability" value="in_stock" required>✅ In stock</label>
<label class="opt"><input type="radio" name="availability" value="out_of_stock">❌ Out of stock</label>
<label class="opt"><input type="radio" name="availability" value="alternative">🔁 I have an alternative</label>
<label class="f" for="price">Price in ₦ (if in stock)</label><input id="price" name="price" type="number" inputmode="numeric" min="50" max="2000000" placeholder="3500">
<label class="f" for="quantity">How many left? (optional)</label><input id="quantity" name="quantity" type="number" inputmode="numeric" min="1" max="1000">
<label class="f" for="alternative">Alternative: name, strength</label><input id="alternative" name="alternative" type="text" maxlength="200" placeholder="e.g. Asthalin 100mcg inhaler">
<label class="f" for="restock">Back in stock when? (optional)</label><input id="restock" name="restock" type="text" maxlength="60" placeholder="e.g. Thursday">
<button type="submit">Send answer</button></form>
<p class="muted" style="text-align:center;margin-top:14px">Rounds asks pharmacies on behalf of customers nearby. No customer details are shared.</p>`,
  );
}

export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "referrer-policy": "no-referrer",
    },
  });
}
