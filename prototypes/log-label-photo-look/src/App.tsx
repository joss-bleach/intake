import { useCallback, useEffect, useState } from "react";
import { PhoneFrame } from "./PhoneFrame";
import { PrototypeSwitcher, VARIANTS, type VariantKey } from "./PrototypeSwitcher";
import { VariantA } from "./variants/VariantA";
import { VariantB } from "./variants/VariantB";
import { VariantC } from "./variants/VariantC";

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
        {variant === "A" && <VariantA />}
        {variant === "B" && <VariantB />}
        {variant === "C" && <VariantC />}
      </PhoneFrame>
      <PrototypeSwitcher current={variant} onChange={handleChange} />
    </>
  );
}
