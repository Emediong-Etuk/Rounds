import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listAreas } from "../server/lib/rounds/catalog.js";

export default defineAction({
  description:
    "List the neighbourhoods Rounds covers in Port Harcourt and Uyo, with centroid coordinates. Use to resolve where the user is.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => ({ areas: await listAreas() }),
});
