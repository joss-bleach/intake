import { useReducer, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { theme, needsReviewIconClass } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import type { FoodSearchResult } from "@/lib/router-types";
import { initialSession, reduce, type Action, type ReviewIngredient, type SavedItem } from "./reducer";

const chipClass =
  "rounded-full border border-purple-300 bg-white/60 px-2.5 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-white";
const chipMutedClass =
  "rounded-full border border-white/70 bg-white/40 px-2.5 py-1 text-xs text-[var(--shell-text-faint)] transition-colors hover:bg-white/60";

const MACRO_FIELDS = [
  { code: "energy_kcal", label: "Energy (kcal)" },
  { code: "protein_g", label: "Protein (g)" },
  { code: "carbohydrate_g", label: "Carbs (g)" },
  { code: "fat_g", label: "Fat (g)" },
] as const;

// A search pick is either a real food (a known id, so a correction can skip
// straight to it — see CorrectItemForm) or free text with no database match
// (id null — Stage 3 re-resolves it, degrading to the LLM-estimate fallback
// per issue #50's "never a dead end" rule).
type FoodPick = { readonly id: string | null; readonly name: string };

// Bare amber Sparkles, no pill/badge (issue #50, prototype/log-description-
// look) — the one needs_review treatment both the review and saved screens
// use, defined once so they can't drift from each other.
function NeedsReviewIcon() {
  return <Sparkles className={needsReviewIconClass} aria-label="Estimated" />;
}

/**
 * Description logging (#46's happy path, #50's ambiguity/correction UI):
 * submit -> Stage 1/2 parse -> review (clarify-up-front chips, inline
 * quantity edits) -> confirm (Stage 3 + save) -> saved, with instance- and
 * food-level corrections available afterward. See reducer.ts for the phase
 * machine this renders.
 */
export function LogDescriptionScreen({ onSaved }: { onSaved: () => void }) {
  const [session, dispatch] = useReducer(reduce, undefined, initialSession);
  const [text, setText] = useState("");
  const parseMutation = useMutation(trpc.logDescription.parse.mutationOptions());
  const confirmMutation = useMutation(trpc.logDescription.confirm.mutationOptions());

  const submit = async () => {
    if (!text.trim()) return;
    dispatch({ type: "SUBMIT_DESCRIPTION", text });
    try {
      const parsed = await parseMutation.mutateAsync({ description: text });
      dispatch({ type: "PARSE_SUCCESS", ingredients: parsed.ingredients });
    } catch (error) {
      dispatch({
        type: "PARSE_FAILURE",
        message: error instanceof Error ? error.message : "Couldn't understand that description.",
      });
    }
  };

  const confirm = async () => {
    if (session.phase !== "reviewing") return;
    dispatch({ type: "CONFIRM_START" });
    // session.ingredients is always non-empty (the `parse` mutation's own
    // ParsedDescription schema guarantees at least one) — the confirm
    // mutation's input type is a tuple for that same reason, so the mapped
    // array (whose length TS can't track through .map) needs asserting back
    // into that shape rather than widening the schema to a plain array.
    type ConfirmIngredient = {
      name: string;
      nameConfidence: "confident" | "needs_review";
      quantity: number;
      quantityUnit: "g" | "ml" | "serving";
      quantityConfidence: "confident" | "needs_review";
      clarificationSearchTerm: string | undefined;
    };
    const ingredients = session.ingredients.map(
      (ingredient): ConfirmIngredient => ({
        name: ingredient.name,
        nameConfidence: ingredient.nameConfidence,
        quantity: ingredient.quantity,
        quantityUnit: ingredient.quantityUnit,
        quantityConfidence: ingredient.quantityConfidence,
        clarificationSearchTerm: ingredient.clarificationAnswer || undefined,
      }),
    ) as [ConfirmIngredient, ...ConfirmIngredient[]];

    try {
      const saved = await confirmMutation.mutateAsync({ ingredients });
      if (!saved) throw new Error("Couldn't save that entry.");
      dispatch({ type: "CONFIRM_SUCCESS", diaryEntryId: saved.id, items: saved.items });
    } catch (error) {
      dispatch({
        type: "CONFIRM_FAILURE",
        message: error instanceof Error ? error.message : "Couldn't save that entry.",
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

      {(session.phase === "idle" || session.phase === "parsing" || session.phase === "hard_failed") && (
        <GlassPanel className="mt-7 flex flex-col gap-4">
          <textarea
            className="min-h-32 w-full resize-none rounded-xl border border-white/70 bg-white/50 p-3.5 text-base text-[var(--shell-text-body)] outline-none placeholder:text-[var(--shell-text-faint)] focus-visible:border-purple-400 focus-visible:bg-white/80"
            placeholder="Grilled chicken breast, 150g, with steamed broccoli"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={session.phase === "parsing"}
          />
          <Button onClick={submit} disabled={session.phase === "parsing" || !text.trim()}>
            {session.phase === "parsing" ? "Reading…" : "Log entry"}
          </Button>
          {session.phase === "hard_failed" && (
            <p className="text-sm text-red-600" data-testid="log-description-error">
              {session.error}
            </p>
          )}
        </GlassPanel>
      )}

      {session.phase === "reviewing" && (
        <div className="mt-7 flex flex-col gap-3" data-testid="log-description-reviewing">
          {session.ingredients.map((ingredient) => (
            <ReviewIngredientCard key={ingredient.index} ingredient={ingredient} dispatch={dispatch} />
          ))}
          {session.error && (
            <p className="text-sm text-red-600" role="alert">
              {session.error}
            </p>
          )}
          <Button onClick={confirm} disabled={session.confirming}>
            {session.confirming ? "Logging…" : "Log entry"}
          </Button>
        </div>
      )}

      {session.phase === "saved" && (
        <div className="mt-7 flex flex-col gap-3" data-testid="log-description-saved">
          {session.items.map((item) => (
            <SavedItemCard key={item.id} item={item} diaryEntryId={session.diaryEntryId} dispatch={dispatch} />
          ))}
          <Button onClick={onSaved}>Done</Button>
        </div>
      )}
    </AppShell>
  );
}

function ReviewIngredientCard({
  ingredient,
  dispatch,
}: {
  ingredient: ReviewIngredient;
  dispatch: React.Dispatch<Action>;
}) {
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState(String(ingredient.quantity));
  const [showChips, setShowChips] = useState(ingredient.clarificationAnswer === undefined);

  const needsReview =
    ingredient.nameConfidence === "needs_review" || ingredient.quantityConfidence === "needs_review";
  const hasChips = ingredient.clarifyOptions !== null && ingredient.clarifyOptions.length > 0;

  const answer = (searchTerm: string | null) => {
    dispatch({ type: "ANSWER_CLARIFICATION", index: ingredient.index, searchTerm });
    setShowChips(false);
  };

  const commitQuantity = () => {
    const value = Number(quantityDraft);
    if (Number.isFinite(value) && value > 0) {
      dispatch({ type: "EDIT_QUANTITY", index: ingredient.index, value });
    } else {
      setQuantityDraft(String(ingredient.quantity));
    }
    setEditingQuantity(false);
  };

  return (
    <GlassPanel variant="tile" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: theme.text.heading }}>
          {ingredient.name}
          {needsReview && <NeedsReviewIcon />}
        </span>
        {editingQuantity ? (
          <span className="flex items-center gap-1.5">
            <Input
              type="number"
              value={quantityDraft}
              onChange={(event) => setQuantityDraft(event.target.value)}
              onBlur={commitQuantity}
              onKeyDown={(event) => event.key === "Enter" && commitQuantity()}
              className="h-8 w-20 text-sm"
              autoFocus
            />
            <span className="text-xs" style={{ color: theme.text.faint }}>
              {ingredient.quantityUnit}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditingQuantity(true)}
            className="tabular-nums text-sm underline decoration-dotted underline-offset-2"
            style={{ color: theme.text.body }}
          >
            {ingredient.quantity}
            {ingredient.quantityUnit}
          </button>
        )}
      </div>

      {hasChips && showChips && (
        <ClarifyChips ingredient={ingredient} onAnswer={answer} />
      )}

      {hasChips && !showChips && (
        <div className="flex items-center gap-2 text-xs" style={{ color: theme.text.faint }}>
          <span>
            {ingredient.clarificationAnswer
              ? `Using: ${ingredient.clarifyOptions?.find((option) => option.searchTerm === ingredient.clarificationAnswer)?.label ?? ingredient.clarificationAnswer}`
              : "Not sure — using our best guess"}
          </span>
          <button type="button" onClick={() => setShowChips(true)} className="underline">
            change
          </button>
        </div>
      )}
    </GlassPanel>
  );
}

function ClarifyChips({
  ingredient,
  onAnswer,
}: {
  ingredient: ReviewIngredient;
  onAnswer: (searchTerm: string | null) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 border-t border-dashed border-white/70 pt-2">
      <p className="text-xs" style={{ color: theme.text.faint }}>
        Which one did you mean?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ingredient.clarifyOptions?.map((option) => (
          <button
            key={option.label}
            type="button"
            className={chipClass}
            onClick={() => onAnswer(option.searchTerm)}
          >
            {option.label}
          </button>
        ))}
        <button type="button" className={chipMutedClass} onClick={() => setSearchOpen(true)}>
          Something else…
        </button>
        <button type="button" className={chipMutedClass} onClick={() => onAnswer(null)}>
          Not sure, skip
        </button>
      </div>

      {searchOpen && (
        <FoodSearchBox placeholder="e.g. soy milk" onPick={(food) => onAnswer(food.name)} />
      )}
    </div>
  );
}

// Shared by the clarify chip's "Something else…" and the instance-level
// correction's food swap (issue #50 code review) — one search-input +
// Search-button + results wiring, not two copies that can drift apart.
function FoodSearchBox({
  placeholder,
  onPick,
}: {
  placeholder: string;
  onPick: (food: FoodPick) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useQuery(trpc.logDescription.searchFood.queryOptions({ query }, { enabled: false }));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button size="sm" onClick={() => search.refetch()} disabled={!query.trim()}>
          Search
        </Button>
      </div>
      {search.data && <FoodSearchResults results={search.data} query={query} onPick={onPick} />}
    </div>
  );
}

function FoodSearchResults({
  results,
  query,
  onPick,
}: {
  results: ReadonlyArray<FoodSearchResult>;
  query: string;
  onPick: (food: FoodPick) => void;
}) {
  if (results.length === 0) {
    // Never a dead end (issue #50): proceeding with the free text still
    // resolves — Stage 3 just falls through to the LLM-estimate fallback.
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs" style={{ color: theme.text.faint }}>
          No matches — we'll estimate it instead.
        </p>
        <button type="button" className={chipClass} onClick={() => onPick({ id: null, name: query })}>
          Use "{query}"
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {results.map((food) => (
        <button
          key={food.id}
          type="button"
          className={chipClass}
          onClick={() => onPick({ id: food.id, name: food.brand ? `${food.name} ${food.brand}` : food.name })}
        >
          {food.name}
          {food.brand ? ` (${food.brand})` : ""}
        </button>
      ))}
    </div>
  );
}

function SavedItemCard({
  item,
  diaryEntryId,
  dispatch,
}: {
  item: SavedItem;
  diaryEntryId: string;
  dispatch: React.Dispatch<Action>;
}) {
  const [correctingFood, setCorrectingFood] = useState(false);
  const [correctingNutrition, setCorrectingNutrition] = useState(false);

  return (
    <GlassPanel variant="tile" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: theme.text.heading }}>
          {item.foodName}
          {item.confidence === "needs_review" && <NeedsReviewIcon />}
          {item.source === "user_corrected" && (
            <span className="text-xs" style={{ color: theme.text.faint }}>
              (corrected)
            </span>
          )}
        </span>
        <span className="tabular-nums text-sm" style={{ color: theme.text.body }}>
          {item.quantity}
          {item.quantityUnit}
        </span>
      </div>

      <div className="flex gap-3 text-xs">
        <button
          type="button"
          className="underline"
          style={{ color: theme.text.faint }}
          onClick={() => setCorrectingFood((v) => !v)}
        >
          Not this food?
        </button>
        <button
          type="button"
          className="underline"
          style={{ color: theme.text.faint }}
          onClick={() => setCorrectingNutrition((v) => !v)}
        >
          Fix nutrition for this food
        </button>
      </div>

      {correctingFood && (
        <CorrectItemForm
          item={item}
          onDone={(items) => {
            dispatch({ type: "ITEMS_UPDATED", items });
            setCorrectingFood(false);
          }}
        />
      )}

      {correctingNutrition && (
        <CorrectFoodForm
          item={item}
          diaryEntryId={diaryEntryId}
          onDone={(items) => {
            dispatch({ type: "ITEMS_UPDATED", items });
            setCorrectingNutrition(false);
          }}
        />
      )}
    </GlassPanel>
  );
}

// Instance-level correction (issue #50): additive — a new logged_items row,
// original kept for audit. Reuses the same search-or-free-text shape as the
// clarify chip's "Something else…", since it's answering the same question
// ("what food is this really").
function CorrectItemForm({
  item,
  onDone,
}: {
  item: SavedItem;
  onDone: (items: ReadonlyArray<SavedItem>) => void;
}) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const correctItem = useMutation(trpc.logDescription.correctItem.mutationOptions());

  const submit = async (food: FoodPick) => {
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) return;
    const updated = await correctItem.mutateAsync({
      loggedItemId: item.id,
      quantity: value,
      quantityUnit: item.quantityUnit,
      // A picked search result carries its own id straight through — no
      // re-resolving by name, which could land on a different food entirely
      // if another one shares that name (issue #50 code review).
      resolution: food.id ? { kind: "food", foodId: food.id } : { kind: "search", searchTerm: food.name },
    });
    if (updated) onDone(updated.items);
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-dashed border-white/70 pt-2">
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="h-8 w-20 text-sm"
        />
        <span className="text-xs" style={{ color: theme.text.faint }}>
          {item.quantityUnit}
        </span>
      </div>
      <FoodSearchBox placeholder="What is it really?" onPick={(food) => void submit(food)} />
    </div>
  );
}

// Food-level correction (issue #50): edits the food's own nutrient_values,
// so it applies to every future log of this food, not just this instance.
function CorrectFoodForm({
  item,
  diaryEntryId,
  onDone,
}: {
  item: SavedItem;
  diaryEntryId: string;
  onDone: (items: ReadonlyArray<SavedItem>) => void;
}) {
  // A field the food has no nutrient row for starts blank, not "0" — the
  // food genuinely doesn't have that value yet, and defaulting it to zero
  // would submit a confident zero for a field the user never touched.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      MACRO_FIELDS.map((field) => [
        field.code,
        item.nutrition?.find((n) => n.code === field.code)?.value.toString() ?? "",
      ]),
    ),
  );
  const correctFood = useMutation(trpc.logDescription.correctFood.mutationOptions());

  const submit = async () => {
    const nutrients = MACRO_FIELDS.map((field) => ({
      code: field.code,
      raw: values[field.code],
      value: Number(values[field.code]),
    }))
      .filter((n) => n.raw.trim() !== "" && Number.isFinite(n.value) && n.value >= 0)
      .map(({ code, value }) => ({ code, value }));
    if (nutrients.length === 0) return;

    const updated = await correctFood.mutateAsync({ foodId: item.foodId, nutrients, diaryEntryId });
    if (updated) onDone(updated.items);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-white/70 pt-2">
      <p className="text-xs" style={{ color: theme.text.faint }}>
        Per 100{item.quantityUnit === "ml" ? "ml" : "g"} — applies to every future log of this food.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {MACRO_FIELDS.map((field) => (
          <label key={field.code} className="flex flex-col gap-0.5 text-xs" style={{ color: theme.text.faint }}>
            {field.label}
            <Input
              type="number"
              value={values[field.code]}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.code]: event.target.value }))}
              className="h-8 text-sm"
            />
          </label>
        ))}
      </div>
      <Button size="sm" onClick={submit} disabled={correctFood.isPending}>
        {correctFood.isPending ? "Saving…" : "Save correction"}
      </Button>
    </div>
  );
}
