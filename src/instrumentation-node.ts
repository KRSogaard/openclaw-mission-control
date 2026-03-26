import { startSyncLoop } from "./lib/agent-sync";

declare global {
  var __bcSyncStarted: boolean | undefined;
}

if (!global.__bcSyncStarted) {
  global.__bcSyncStarted = true;
  startSyncLoop();
  console.log("[bridge-command] Background sync and task loops started");
}
