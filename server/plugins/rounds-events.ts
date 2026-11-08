import { defineNitroPlugin } from "@agent-native/core/server";

import { registerRoundsEvents } from "../lib/rounds/events.js";

export default defineNitroPlugin(() => {
  registerRoundsEvents();
});
