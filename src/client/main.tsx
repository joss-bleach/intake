import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react";
import App from "./App";
import { queryClient } from "@/lib/trpc";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Plain React SPA, no router (#95) — nuqs's router-agnostic adapter reads/writes
        the URL directly so sign-in step/email survive a mobile tab-background reload. */}
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </NuqsAdapter>
  </StrictMode>,
);
