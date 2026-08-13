import { useReducer, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { theme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import { initialSession, reduce } from "./reducer";

// Happy-path description logging (#46): a text description in, a saved diary
// entry out — no ambiguity/candidate-picking or correction UI, that's #50.
// The server does Stage 1/2 parse + Stage 3 resolve + save as one mutation
// (src/server/log-description), so the reducer's phase machine only has to
// model idle/submitting/saved/hard_failed — see reducer.ts's comment for why
// that's a deliberate simplification from the prototype it's ported from.
export function LogDescriptionScreen({ onSaved }: { onSaved: () => void }) {
  const [session, dispatch] = useReducer(reduce, undefined, initialSession);
  const [text, setText] = useState("");
  const createEntry = useMutation(trpc.logDescription.create.mutationOptions());

  const submit = async () => {
    if (!text.trim()) return;
    dispatch({ type: "SUBMIT_DESCRIPTION", text });

    try {
      const entry = await createEntry.mutateAsync({ description: text });
      dispatch({
        type: "LOG_SUCCESS",
        items: (entry?.items ?? []).map((item) => ({
          foodName: item.foodName,
          quantity: item.quantity,
          quantityUnit: item.quantityUnit,
          confidence: item.confidence,
          source: item.source,
        })),
      });
    } catch (error) {
      dispatch({
        type: "LOG_FAILURE",
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  };

  return (
    <AppShell activeTab="log">
      <h1
        className="font-display text-[1.6rem] leading-[1.05] tracking-[-0.02em]"
        style={{ color: theme.text.heading }}
      >
        Log a meal
      </h1>

      <GlassPanel className="mt-7 flex flex-col gap-4">
        {session.phase !== "saved" && (
          <>
            <textarea
              className="min-h-32 w-full resize-none rounded-xl border border-white/70 bg-white/50 p-3.5 text-base text-[var(--shell-text-body)] outline-none placeholder:text-[var(--shell-text-faint)] focus-visible:border-purple-400 focus-visible:bg-white/80"
              placeholder="Grilled chicken breast, 150g, with steamed broccoli"
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={session.phase === "submitting"}
            />

            <Button onClick={submit} disabled={session.phase === "submitting" || !text.trim()}>
              {session.phase === "submitting" ? "Logging…" : "Log entry"}
            </Button>

            {session.phase === "hard_failed" && (
              <p className="text-sm text-red-600" data-testid="log-description-error">
                {session.error ?? "Couldn't understand that description."}
              </p>
            )}
          </>
        )}

        {session.phase === "saved" && (
          <div className="flex flex-col gap-3" data-testid="log-description-saved">
            <p className="text-sm" style={{ color: theme.text.body }}>
              Saved.
            </p>
            {session.items.map((item, index) => (
              <div key={`${item.foodName}-${index}`} className="text-sm" style={{ color: theme.text.body }}>
                {item.foodName} — {item.quantity}{item.quantityUnit}
                {item.confidence === "needs_review" && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    check this is correct
                  </span>
                )}
              </div>
            ))}
            <Button onClick={onSaved}>Done</Button>
          </div>
        )}
      </GlassPanel>
    </AppShell>
  );
}
