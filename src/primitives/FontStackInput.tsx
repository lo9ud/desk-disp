import { useState, useEffect } from "react";
import { ChipInput } from "./ChipInput";
import { getInstalledFonts, parseGenericFallback, buildFontValue } from "../utils/fonts";

export function FontStackInput({
  value,
  onChange,
  genericFallback,
}: {
  value: string;
  onChange: (value: string) => void;
  genericFallback: string;
}) {
  const [fontList, setFontList] = useState<string[]>([]);
  const datalistId = `font-stack-${genericFallback}`;

  useEffect(() => {
    getInstalledFonts().then(setFontList);
  }, []);

  const { fonts: userFonts } = parseGenericFallback(value);

  const suggestions = fontList.filter(
    (f) => !userFonts.includes(f),
  ).slice(0, 30);

  function handleChipsChange(chips: string[]) {
    onChange(buildFontValue(chips, genericFallback));
  }

  return (
    <ChipInput
      chips={userFonts}
      onChipsChange={handleChipsChange}
      lockedChips={[{ label: genericFallback, title: "Always-present generic fallback" }]}
      suggestions={suggestions}
      placeholder="Add font…"
      datalistId={datalistId}
    />
  );
}
