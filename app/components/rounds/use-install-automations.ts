import { callAction } from "@agent-native/core/client/hooks";
import { useEffect } from "react";

const KEY = "rounds.automations.v1";

/** Install the per-user Rounds automations once per browser (the action is idempotent). */
export function useInstallRoundsAutomations() {
  useEffect(() => {
    let done = false;
    try {
      done = window.localStorage.getItem(KEY) === "1";
    } catch {
      // storage unavailable: just call the idempotent action
    }
    if (done) return;
    callAction("install-rounds-automations", {})
      .then(() => {
        try {
          window.localStorage.setItem(KEY, "1");
        } catch {
          // ignore
        }
      })
      .catch(() => undefined);
  }, []);
}
