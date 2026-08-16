// Ambient type for the one runtime import from the Workers platform this
// repo makes (worker.ts) — kept local instead of the full
// @cloudflare/workers-types package, whose global Request/Response
// declarations collide with the project's DOM lib.
declare module "cloudflare:workers" {
  export const env: {
    HYPERDRIVE: { connectionString: string };
    GLITCHTIP_DSN?: string;
  };
}
