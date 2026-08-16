import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { clearPersistedCache } from "./trpc";
import { clearPersistedSignIn } from "./sign-in-persistence";

// Proxied by Vite's dev server to the standalone server (see vite.config.ts
// and src/server/auth/index.ts) — same-origin, so no baseURL override needed.
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export const { useSession } = authClient;

// Wraps betterauth's signOut so a second account signing in on the same
// device never renders the previous account's cached goals/profile (queries
// are persisted 24h — see lib/trpc.ts) before its own data lands.
export const signOut = async () => {
  await authClient.signOut();
  await clearPersistedCache();
  clearPersistedSignIn();
};
