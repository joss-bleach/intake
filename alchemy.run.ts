import alchemy from "alchemy";

// Infra entry point — skeleton only, no real resources yet (see issue #40).
// State is stored locally under .alchemy/ (gitignored) for now; a real
// backend and the first actual resources land alongside the tickets that
// need them.
const app = await alchemy("intake");

await app.finalize();
