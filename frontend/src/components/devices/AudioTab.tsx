import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

const INPUT_SOURCES = [
  { value: "wifi", label: "WiFi" },
  { value: "bluetooth", label: "Bluetooth" },
  { value: "line-in", label: "Line In" },
  { value: "optical", label: "Optical" },
  { value: "coaxial", label: "Coaxial" },
  { value: "udisk", label: "USB" },
  { value: "HDMI", label: "HDMI" },
  { value: "RCA", label: "RCA" },
];

function balanceLabel(balance: number): string {
  if (balance === 0) return "Center";
  if (balance < 0) return `Left ${Math.abs(balance).toFixed(1)}`;
  return `Right ${balance.toFixed(1)}`;
}

function rssiToLabel(rssi: number): { label: string; color: string; bars: number } {
  if (rssi >= -50) return { label: "Excellent", color: "text-green-400", bars: 4 };
  if (rssi >= -60) return { label: "Good", color: "text-green-400", bars: 3 };
  if (rssi >= -70) return { label: "Fair", color: "text-yellow-400", bars: 2 };
  return { label: "Weak", color: "text-red-400", bars: 1 };
}

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-11 h-6 rounded-full transition-colors relative ${
        enabled ? "bg-[var(--color-accent)]" : "bg-white/15"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
          enabled ? "left-[22px]" : "left-[4px]"
        }`}
      />
    </button>
  );
}

function SignalBars({ bars }: { bars: number }) {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-colors signal-bar ${i <= bars ? "bg-current" : "bg-white/15"}`}
          ref={(el) => {
            if (el) el.style.setProperty("--bar-height", `${i * 25}%`);
          }}
        />
      ))}
    </div>
  );
}

function InputSourceGrid({
  currentSource,
  onSourceChange,
}: {
  currentSource: string | null;
  onSourceChange: (source: string) => void;
}) {
  return (
    <div className="bg-[var(--color-surface-elevated)] rounded-xl p-4 space-y-3">
      <div className="text-sm font-medium">Input Source</div>
      <div className="grid grid-cols-4 gap-1.5">
        {INPUT_SOURCES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onSourceChange(value)}
            className={`text-xs py-2 rounded-lg transition-colors ${
              currentSource === value
                ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40"
                : "bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WifiSignalCard({
  signal,
  ssid,
  rssi,
}: {
  signal: { label: string; color: string; bars: number };
  ssid: string | null;
  rssi: number;
}) {
  return (
    <div className="bg-[var(--color-surface-elevated)] rounded-xl px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">WiFi Signal</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            {ssid ? `${ssid} · ` : ""}
            {rssi} dBm
          </div>
        </div>
        <div className={`flex items-center gap-2 ${signal.color}`}>
          <span className="text-xs font-medium">{signal.label}</span>
          <SignalBars bars={signal.bars} />
        </div>
      </div>
    </div>
  );
}

function BalanceSlider({
  balance,
  onChange,
}: {
  balance: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="bg-[var(--color-surface-elevated)] rounded-xl p-4 space-y-3">
      <div className="text-sm font-medium">Channel Balance</div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--color-text-secondary)] shrink-0">L</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.1}
          defaultValue={balance}
          onChange={onChange}
          className="flex-1 h-1 accent-[var(--color-accent)] bg-white/10 rounded-full appearance-none cursor-pointer"
        />
        <span className="text-xs text-[var(--color-text-secondary)] shrink-0">R</span>
      </div>
      <div className="text-xs text-center text-[var(--color-text-secondary)]">
        {balanceLabel(balance)}
      </div>
    </div>
  );
}

function useAudioQueries(deviceId: string) {
  const balanceQuery = useQuery({
    queryKey: ["eq", "balance", deviceId],
    queryFn: () => api.getBalance(deviceId),
  });
  const crossfadeQuery = useQuery({
    queryKey: ["eq", "crossfade", deviceId],
    queryFn: () => api.getCrossfade(deviceId),
  });
  const wifiQuery = useQuery({
    queryKey: ["device", "wifi", deviceId],
    queryFn: () => api.getWifiStatus(deviceId),
    refetchInterval: 30000,
  });
  return { balanceQuery, crossfadeQuery, wifiQuery };
}

function useAudioHandlers(deviceId: string) {
  const queryClient = useQueryClient();
  const balanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSourceChange = async (source: string) => {
    await api.switchSource(deviceId, source);
    queryClient.invalidateQueries({ queryKey: ["device", "wifi", deviceId] });
  };

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (balanceTimerRef.current) clearTimeout(balanceTimerRef.current);
    balanceTimerRef.current = setTimeout(async () => {
      await api.setBalance(deviceId, value);
      queryClient.invalidateQueries({ queryKey: ["eq", "balance", deviceId] });
    }, 200);
  };

  const handleCrossfadeToggle = async (currentlyEnabled: boolean) => {
    await api.setCrossfade(deviceId, !currentlyEnabled);
    queryClient.invalidateQueries({ queryKey: ["eq", "crossfade", deviceId] });
  };

  return { handleSourceChange, handleBalanceChange, handleCrossfadeToggle };
}

function CrossfadeCard({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between bg-[var(--color-surface-elevated)] rounded-xl px-4 py-3">
      <div className="text-sm font-medium">Crossfade</div>
      <ToggleSwitch enabled={enabled} onToggle={onToggle} />
    </div>
  );
}

function extractWifiData(data: { rssi?: number; ssid?: string; source?: string } | undefined) {
  return {
    rssi: data?.rssi ?? null,
    ssid: data?.ssid ?? null,
    currentSource: data?.source ?? null,
  };
}

function useAudioData(deviceId: string) {
  const { balanceQuery, crossfadeQuery, wifiQuery } = useAudioQueries(deviceId);
  return {
    ...extractWifiData(wifiQuery.data),
    balance: balanceQuery.data?.balance ?? 0,
    crossfadeEnabled: crossfadeQuery.data?.enabled ?? false,
  };
}

export function AudioTab({ deviceId }: { deviceId: string }) {
  const { rssi, ssid, currentSource, balance, crossfadeEnabled } = useAudioData(deviceId);
  const { handleSourceChange, handleBalanceChange, handleCrossfadeToggle } =
    useAudioHandlers(deviceId);

  const signal = rssi !== null ? rssiToLabel(rssi) : null;

  return (
    <div className="space-y-3">
      <InputSourceGrid currentSource={currentSource} onSourceChange={handleSourceChange} />
      {signal && rssi !== null && <WifiSignalCard signal={signal} ssid={ssid} rssi={rssi} />}
      <BalanceSlider balance={balance} onChange={handleBalanceChange} />
      <CrossfadeCard
        enabled={crossfadeEnabled}
        onToggle={() => handleCrossfadeToggle(crossfadeEnabled)}
      />
    </div>
  );
}
