import { useState } from "react";
import { useMediaSessionDebug } from "../../hooks/useMediaSession";

export function DebugOverlay() {
  const debugLogs = useMediaSessionDebug();
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="shrink-0">
      <button
        onClick={() => setShowDebug(!showDebug)}
        className="w-full text-[10px] text-white/30 py-0.5 text-center"
      >
        {showDebug ? "hide debug" : `media session debug (${debugLogs.length})`}
      </button>
      {showDebug && (
        <div className="bg-black/80 text-[10px] font-mono text-green-400 px-3 py-2 max-h-48 overflow-y-auto">
          {debugLogs.length === 0 ? (
            <div className="text-white/30">no logs yet</div>
          ) : (
            debugLogs.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      )}
    </div>
  );
}
