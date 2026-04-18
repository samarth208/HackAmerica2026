// Read DESIGN.md and CLAUDE.md before modifying.

import { useState } from "react";

type TimeRangeValue = "1h" | "6h" | "24h" | "7d" | "30d" | "custom";

interface TimeRangePickerProps {
  value: TimeRangeValue;
  onChange: (range: TimeRangeValue, custom?: { from: Date; to: Date }) => void;
  className?: string;
}

const PRESETS: Exclude<TimeRangeValue, "custom">[] = ["1h", "6h", "24h", "7d", "30d"];

export default function TimeRangePicker({
  value,
  onChange,
  className,
}: TimeRangePickerProps) {
  const [showCustom, setShowCustom] = useState<boolean>(value === "custom");
  const [fromStr, setFromStr] = useState<string>("");
  const [toStr, setToStr] = useState<string>("");

  function handlePreset(preset: Exclude<TimeRangeValue, "custom">) {
    setShowCustom(false);
    onChange(preset);
  }

  function handleCustomClick() {
    setShowCustom(true);
    onChange("custom");
  }

  function applyCustom() {
    if (!fromStr || !toStr) return;
    onChange("custom", { from: new Date(fromStr), to: new Date(toStr) });
  }

  const pillBase =
    "px-3 py-1 rounded-full font-label text-xs uppercase cursor-pointer transition-colors";
  const pillActive = "bg-accent text-white border border-accent";
  const pillInactive =
    "bg-surface text-text-muted border border-border hover:border-accent";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => handlePreset(preset)}
          className={`${pillBase} ${value === preset ? pillActive : pillInactive}`}
        >
          {preset}
        </button>
      ))}

      <button
        onClick={handleCustomClick}
        className={`${pillBase} ${value === "custom" ? pillActive : pillInactive}`}
      >
        Custom
      </button>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-surface border border-border rounded-lg w-full">
          <input
            type="datetime-local"
            value={fromStr}
            onChange={(e) => setFromStr(e.target.value)}
            className="bg-bg border border-border text-text-primary rounded px-2 py-1 font-ui text-sm"
          />
          <span className="text-text-muted font-ui text-sm">to</span>
          <input
            type="datetime-local"
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            className="bg-bg border border-border text-text-primary rounded px-2 py-1 font-ui text-sm"
          />
          <button
            onClick={applyCustom}
            className="bg-accent text-white rounded px-3 py-1 font-ui text-xs"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
