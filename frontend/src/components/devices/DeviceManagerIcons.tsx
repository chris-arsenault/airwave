import { useRef } from "react";

export function PresetButton({
  slot,
  hasPreset,
  groupCount,
  onClick,
  onLongPress,
}: {
  slot: number;
  hasPreset: boolean;
  groupCount: number;
  onClick: () => void;
  onLongPress: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const startPress = () => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, 600);
  };

  const endPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!firedRef.current) onClick();
  };

  return (
    <button
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
      }}
      onTouchStart={startPress}
      onTouchEnd={(e) => {
        e.preventDefault();
        endPress();
      }}
      className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
        hasPreset
          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
          : "bg-white/5 text-white/30 border border-white/10"
      }`}
      title={
        hasPreset
          ? `Load preset ${slot + 1} (${groupCount} groups) — hold to overwrite`
          : `Hold to save preset ${slot + 1}`
      }
    >
      {slot + 1}
    </button>
  );
}

export function GroupIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-orange-400"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function UnlinkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3" />
    </svg>
  );
}
