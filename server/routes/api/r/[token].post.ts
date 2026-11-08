import { defineEventHandler, getRouterParam, readRawBody } from "h3";

import { htmlResponse, renderForm, renderMessagePage, submitLinkReply } from "../../../lib/rounds/reply-link.js";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  const raw = (await readRawBody(event)) ?? "";
  if (raw.length > 4000) return htmlResponse(renderMessagePage("Too long", "Please shorten your answer and try again."), 413);
  const form = Object.fromEntries(new URLSearchParams(raw).entries());
  const result = await submitLinkReply(token, form);
  switch (result.kind) {
    case "not_found":
      return htmlResponse(renderMessagePage("Link not found", "This stock-check link doesn't exist."), 404);
    case "expired":
      return htmlResponse(renderMessagePage("This request has closed", "Thank you! The customer is no longer waiting on this one."), 410);
    case "limit":
      return htmlResponse(
        renderMessagePage("Already answered", "We've received several answers on this link. Please reply on Telegram if anything changed."),
        429,
      );
    case "invalid":
      return htmlResponse(renderForm(result.ctx, { error: result.error }), 400);
    case "ok":
      return new Response(null, { status: 303, headers: { location: `/r/${encodeURIComponent(token)}?done=1` } });
  }
});
