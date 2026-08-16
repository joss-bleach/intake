/**
 * One-off: forget the Sentry resources #105/#106 removed from alchemy.run.ts.
 * Their state entries outlived the code, so deploy fails in finalize() with no
 * provider to destroy them — and destroying them would DELETE the live Sentry
 * key. Read phase: finalize() is a no-op. Delete once state is clean.
 *
 * STAGE=runner pnpm tsx --env-file=.env.production scripts/forget-orphan-state.ts
 */
import alchemy, { Scope } from "alchemy";
import { CloudflareStateStore } from "alchemy/state";

const ORPHANS = ["sentry-key", "project", "team"];

await alchemy("intake", {
  phase: "read",
  stateStore: (scope) => new CloudflareStateStore(scope),
});

// alchemy() returns the root scope; resources live one level down, in the stage.
const app = Scope.current;

// list() names the resources without decrypting them — no password needed.
const tracked = new Set(await app.state.list());

for (const id of ORPHANS) {
  if (!tracked.has(id)) {
    console.log(`skip   ${app.chain.join("/")}/${id} (not in state)`);
    continue;
  }
  await app.state.delete(id);
  console.log(`forgot ${app.chain.join("/")}/${id}`);
}

console.log(`remaining: ${(await app.state.list()).sort().join(", ") || "(none)"}`);
