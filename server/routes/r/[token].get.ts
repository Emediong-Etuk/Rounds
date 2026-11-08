import { defineEventHandler, getQuery, getRouterParam } from "h3";

import { htmlResponse, isExpired, loadByToken, renderForm, renderMessagePage } from "../../lib/rounds/reply-link.js";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  const ctx = await loadByToken(token);
  if (!ctx) {
    return htmlResponse(renderMessagePage("Link not found", "This stock-check link doesn't exist. Please use the latest message from Rounds."), 404);
  }
  if (isExpired(ctx)) {
    return htmlResponse(renderMessagePage("This request has closed", "Thank you! The customer is no longer waiting on this one."), 410);
  }
  return htmlResponse(renderForm(ctx, { done: getQuery(event).done === "1" }));
});
