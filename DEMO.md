# Rounds demo script (~2 minutes, record with Clips)

**Before recording**
- Production URL open and signed in; agent sidebar visible on the right.
- `pnpm action reset-demo` (as the demo account) so recent searches are clean.
- 2–3 friends' phones connected (Pharmacies page → Oakline, Palm Court, Harbour Meds → QR → Start).
- One earlier Ventolin search already done, so "Greenleaf had it 2 days ago" shows (it's seeded too).
- Phone screens mirrored or ready to film.

## 0:00–0:12 · The problem
"In Nigeria, finding a medicine means going from pharmacy to pharmacy. Pharmacies don't publish stock, so search apps don't work. Rounds asks the pharmacists for you."

## 0:12–0:30 · Ask
- In chat: **"I need a Ventolin inhaler, I'm around Rumuola."**
- Agent confirms salbutamol 100mcg inhaler (Rx: bring prescription; equivalents OK?) and proposes 8 pharmacies: "Greenleaf had it 2 days ago at ₦3,400".
- **"Yes, ask them."** The UI jumps to the board by itself.

## 0:30–1:05 · Phones buzz
Cut to the phones on Telegram:
- Phone 1 taps **✅ In stock**, types **3500**.
- Phone 2 types **"e don finish o, maybe Thursday"**.
- Phone 3 opens **Reply with price →** and submits the form.

Back on the board: cards flip in live, each with the pharmacist's raw words in a bubble and **"Read by Rounds AI"**. Demo pharmacies fill in the rest (Pidgin, a price quote, an alternative, a silent one).

## 1:05–1:25 · Human + agent together
- **Edit** one card (fix the price) → "Edited by you".
- On the Asthalin card tap **Is this OK?** → agent: same ingredient and strength, confirm with your pharmacist.
- Ask in chat: **"Which is cheapest and closest?"** → answered from the board.

## 1:25–1:45 · Act
- Click a phone pharmacy's card, then in chat: **"Hold this one for Ada till 6pm."**
- The phone gets the hold request → taps **✅ I'll hold it** → board shows **📌 Held for Ada until 6:00 PM**.

## 1:45–2:00 · Close
- Show the actions list (README table): "One `record-reply` action powers the agent, the user and the pharmacist."
- Start a second Ventolin search: the confirm step shows "Had it just now · ₦3,500" (stock memory).
- Tagline: **"Rounds. We do the pharmacy rounds so you don't have to."**

## Fallbacks if something misbehaves live
- Telegram slow: use **Simulate a reply** (bottom of the board) — it goes through the same inbound pipeline.
- Agent slow to read: the rules fallback records the reply after 60 s.
- Silent card: wait ~75 s for **Nudge**; the demo pharmacy answers the nudge.
