import { useCallback, useEffect, useState } from "react";
import { PhoneFrame } from "./PhoneFrame";
import { PrototypeSwitcher, VARIANTS, type VariantKey } from "./PrototypeSwitcher";
import { InsightsShell } from "./InsightsShell";
import { ComparisonA } from "./variants/ComparisonA";
import { ComparisonB } from "./variants/ComparisonB";
import { ComparisonC } from "./variants/ComparisonC";

function readVariantFromUrl(): VariantKey {
  const param = new URLSearchParams(window.location.search).get("variant");
  const match = VARIANTS.find((v) => v.key === param);
  return match ? match.key : "A";
}

export default function App() {
  const [variant, setVariant] = useState<VariantKey>(readVariantFromUrl);

  useEffect(() => {
    const onPopState = () => setVariant(readVariantFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleChange = useCallback((key: VariantKey) => {
    setVariant(key);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState({}, "", url);
  }, []);

  return (
    <>
      <PhoneFrame>
        {variant === "A" && <InsightsShell ComparisonBlock={ComparisonA} />}
        {variant === "B" && <InsightsShell ComparisonBlock={ComparisonB} />}
        {variant === "C" && <InsightsShell ComparisonBlock={ComparisonC} />}
      </PhoneFrame>
      <PrototypeSwitcher current={variant} onChange={handleChange} />
    </>
  );
}
