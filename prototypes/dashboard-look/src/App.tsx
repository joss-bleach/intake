import { useCallback, useEffect, useState } from "react";
import { PhoneFrame } from "./PhoneFrame";
import { PrototypeSwitcher, VARIANTS, type VariantKey } from "./PrototypeSwitcher";
import { dashboardData } from "./data";
import { VariantC6A } from "./variants/VariantC6A";
import { VariantC6B } from "./variants/VariantC6B";
import { VariantC6C } from "./variants/VariantC6C";
import { VariantC6D } from "./variants/VariantC6D";

function readVariantFromUrl(): VariantKey {
  const param = new URLSearchParams(window.location.search).get("variant");
  const match = VARIANTS.find((v) => v.key === param);
  return match ? match.key : "C6A";
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
        {variant === "C6A" && <VariantC6A data={dashboardData} />}
        {variant === "C6B" && <VariantC6B data={dashboardData} />}
        {variant === "C6C" && <VariantC6C data={dashboardData} />}
        {variant === "C6D" && <VariantC6D data={dashboardData} />}
      </PhoneFrame>
      <PrototypeSwitcher current={variant} onChange={handleChange} />
    </>
  );
}
