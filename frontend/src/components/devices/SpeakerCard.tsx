import { useState } from "react";
import { api, type Device } from "../../api/client";
import { useDeviceStore } from "../../stores/deviceStore";

interface SpeakerCardProps {
  device: Device;
  isMaster: boolean;
  isActive: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onSelect: () => void;
  onVolumeChange: (value: number) => void;
  onMuteToggle: () => void;
  onToggleEnabled: () => void;
}

export function SpeakerCard(props: SpeakerCardProps) {
  const {
    device,
    isMaster,
    isActive,
    isDragging,
    onDragStart,
    onDragEnd,
    onSelect,
    onVolumeChange,
    onMuteToggle,
    onToggleEnabled,
  } = props;
  const volumePercent = Math.round(device.volume * 100);
  const updateDevice = useDeviceStore((s) => s.updateDevice);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(device.name);

  const handleRename = async () => {
    if (!editName.trim() || editName === device.name) {
      setEditing(false);
      return;
    }
    await api.renameDevice(device.id, editName.trim());
    updateDevice(device.id, { name: editName.trim() });
    setEditing(false);
  };

  const handleChannelChange = async (ch: string) => {
    updateDevice(device.id, { channel: ch });
    await api.setChannel(device.id, ch);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={speakerCardClass(isDragging, device.enabled, isActive)}
    >
      <SpeakerCardHeader
        device={device}
        isMaster={isMaster}
        editing={editing}
        editName={editName}
        onEditNameChange={setEditName}
        onRename={handleRename}
        onStartEdit={() => {
          setEditName(device.name);
          setEditing(true);
        }}
        onCancelEdit={() => setEditing(false)}
        onToggleEnabled={onToggleEnabled}
      />
      <VolumeControl
        device={device}
        volumePercent={volumePercent}
        onVolumeChange={onVolumeChange}
        onMuteToggle={onMuteToggle}
      />
      <ChannelSelector device={device} onChannelChange={handleChannelChange} />
    </div>
  );
}

function speakerCardClass(isDragging: boolean, enabled: boolean, isActive: boolean): string {
  const base =
    "bg-[var(--color-surface-elevated)] p-3 rounded-xl transition-all cursor-grab active:cursor-grabbing";
  const drag = isDragging ? "opacity-30 scale-95" : "";
  const disabled = !enabled ? "opacity-50" : "";
  const active = isActive && enabled ? "ring-1 ring-[var(--color-accent)]" : "";
  return `${base} ${drag} ${disabled} ${active}`;
}

function VolumeControl({
  device,
  volumePercent,
  onVolumeChange,
  onMuteToggle,
}: {
  device: Device;
  volumePercent: number;
  onVolumeChange: (value: number) => void;
  onMuteToggle: () => void;
}) {
  if (!device.enabled || !device.capabilities.rendering_control) return null;
  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
    <fieldset
      aria-label="Volume controls"
      className="flex items-center gap-1.5 mt-1 border-0 p-0 m-0"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={onMuteToggle}
        className={`shrink-0 ${device.muted ? "text-red-400" : "text-[var(--color-text-secondary)]"}`}
      >
        {device.muted ? <VolumeMutedIcon /> : <VolumeIcon />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={volumePercent}
        onChange={(e) => onVolumeChange(parseInt(e.target.value))}
        className="flex-1 h-1 accent-[var(--color-accent)] bg-white/10 rounded-full appearance-none cursor-pointer"
      />
      <span className="text-[11px] text-[var(--color-text-secondary)] w-6 text-right shrink-0">
        {volumePercent}
      </span>
    </fieldset>
  );
}

function channelShortLabel(ch: string): string {
  if (ch === "Left") return "L";
  if (ch === "Right") return "R";
  return "S";
}

function ChannelSelector({
  device,
  onChannelChange,
}: {
  device: Device;
  onChannelChange: (ch: string) => void;
}) {
  if (!device.enabled || device.device_type !== "wiim" || device.channel == null) return null;
  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
    <fieldset
      aria-label="Channel selection"
      className="flex items-center gap-1.5 mt-1.5 border-0 p-0 m-0"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">Ch</span>
      <div className="flex rounded-md overflow-hidden border border-white/10">
        {["Left", "Stereo", "Right"].map((ch) => (
          <button
            key={ch}
            onClick={() => onChannelChange(ch)}
            className={`px-2 py-0.5 text-[10px] transition-colors ${
              device.channel === ch
                ? "bg-[var(--color-accent)] text-white"
                : "bg-white/5 text-white/50 hover:bg-white/10"
            }`}
          >
            {channelShortLabel(ch)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SpeakerCardHeader({
  device,
  isMaster,
  editing,
  editName,
  onEditNameChange,
  onRename,
  onStartEdit,
  onCancelEdit,
  onToggleEnabled,
}: {
  device: Device;
  isMaster: boolean;
  editing: boolean;
  editName: string;
  onEditNameChange: (name: string) => void;
  onRename: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggleEnabled: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-1 mb-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <DragHandle />
          {isMaster && (
            <span className="text-[10px] text-orange-400 bg-orange-400/10 px-1 py-0.5 rounded-full shrink-0">
              M
            </span>
          )}
          <DeviceTypeBadge device={device} />
        </div>
        <SpeakerNameField
          device={device}
          editing={editing}
          editName={editName}
          onEditNameChange={onEditNameChange}
          onRename={onRename}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
        />
        <div className="text-[11px] text-[var(--color-text-secondary)] truncate">
          {device.model ?? device.ip}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleEnabled();
        }}
        className={`w-8 h-4.5 rounded-full transition-colors relative shrink-0 mt-0.5 ${
          device.enabled ? "bg-[var(--color-accent)]" : "bg-white/15"
        }`}
        title={device.enabled ? "Disable" : "Enable"}
      >
        <div
          className={`w-3 h-3 rounded-full bg-white absolute top-[3px] transition-all ${
            device.enabled ? "left-[17px]" : "left-[3px]"
          }`}
        />
      </button>
    </div>
  );
}

function SpeakerNameField({
  device,
  editing,
  editName,
  onEditNameChange,
  onRename,
  onStartEdit,
  onCancelEdit,
}: {
  device: Device;
  editing: boolean;
  editName: string;
  onEditNameChange: (name: string) => void;
  onRename: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="font-medium text-sm leading-tight flex items-center gap-1">
      {editing ? (
        <input
          value={editName}
          onChange={(e) => onEditNameChange(e.target.value)}
          onBlur={onRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename();
            if (e.key === "Escape") onCancelEdit();
          }}
          /* eslint-disable-next-line jsx-a11y/no-autofocus */
          autoFocus
          className="bg-white/10 rounded px-1 py-0.5 text-sm text-white outline-none border border-white/20 w-full"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="truncate">{device.name}</span>
          {device.device_type === "wiim" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
              className="p-0.5 text-white/30 hover:text-white/70 transition-colors shrink-0"
              title="Rename"
            >
              <PencilIcon />
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function DeviceTypeBadge({ device }: { device: Device }) {
  if (device.device_type === "wiim") {
    return (
      <>
        <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded-full shrink-0">
          WiiM
        </span>
        {!device.capabilities.https_api && (
          <span
            className="text-[10px] text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded-full shrink-0"
            title="Reboot device to restore EQ controls"
          >
            Reboot
          </span>
        )}
      </>
    );
  }
  return (
    <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1 py-0.5 rounded-full shrink-0">
      UPnP
    </span>
  );
}

// --- Icons ---

function DragHandle() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-white/25 shrink-0"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function VolumeMutedIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}
