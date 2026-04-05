import { useState, useCallback, useEffect } from "react";
import { api, type Device, type GroupDefinition } from "../../api/client";
import { useDeviceStore } from "../../stores/deviceStore";
import { SpeakerCard } from "./SpeakerCard";
import { GroupIcon, UnlinkIcon, PresetButton } from "./DeviceManagerIcons";

interface GroupPreset {
  groups: GroupDefinition[];
}

function useDeviceActions() {
  const updateDevice = useDeviceStore((s) => s.updateDevice);

  const handleVolumeChange = useCallback(
    async (device: Device, value: number) => {
      const volume = value / 100;
      updateDevice(device.id, { volume });
      await api.setVolume(device.id, volume);
    },
    [updateDevice]
  );

  const handleMuteToggle = useCallback(
    async (device: Device) => {
      await api.toggleMute(device.id);
      updateDevice(device.id, { muted: !device.muted });
    },
    [updateDevice]
  );

  const handleToggleEnabled = useCallback(
    async (device: Device) => {
      const newEnabled = !device.enabled;
      updateDevice(device.id, { enabled: newEnabled });
      await api.setEnabled(device.id, newEnabled);
    },
    [updateDevice]
  );

  return { handleVolumeChange, handleMuteToggle, handleToggleEnabled };
}

export function DeviceManager() {
  const devices = useDeviceStore((s) => s.devices);
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId);
  const setActiveDevice = useDeviceStore((s) => s.setActiveDevice);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [presets, setPresets] = useState<(GroupPreset | null)[]>([null, null, null, null, null]);

  usePresetLoader(setPresets);

  const { groups, ungroupedDevices } = useGroupZones(devices);
  const removeFromCurrentGroup = useRemoveFromGroup(devices);
  const handleDrop = useDrop(dragId, devices, removeFromCurrentGroup, setDragOver, setDragId);
  const { handleVolumeChange, handleMuteToggle, handleToggleEnabled } = useDeviceActions();

  const handlePresetClick = useCallback(
    async (slot: number) => {
      if (!presets[slot]) return;
      await api.loadPreset(slot + 1);
    },
    [presets]
  );

  const handlePresetLongPress = useCallback(async (slot: number) => {
    await api.savePreset(slot + 1);
    const data = await api.getPresets();
    setPresets(parsePresets(data.presets));
  }, []);

  if (devices.length === 0) {
    return <DiscoveringState />;
  }

  const isDragging = dragId !== null;
  const speakerProps = {
    devices,
    activeDeviceId,
    dragId,
    dragOver,
    isDragging,
    setDragId,
    setDragOver,
    setActiveDevice,
    handleDrop,
    handleVolumeChange,
    handleMuteToggle,
    handleToggleEnabled,
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Rooms</h2>
      <PresetsBar
        presets={presets}
        onPresetClick={handlePresetClick}
        onPresetLongPress={handlePresetLongPress}
      />
      <GroupList groups={groups} {...speakerProps} />
      <UngroupedList {...speakerProps} devices={ungroupedDevices} />
      {isDragging && (
        <UngroupDropZone dragOver={dragOver} setDragOver={setDragOver} handleDrop={handleDrop} />
      )}
    </div>
  );
}

// --- Hooks ---

function parsePresets(
  rawPresets: Record<string, GroupDefinition[] | null>
): (GroupPreset | null)[] {
  const slots: (GroupPreset | null)[] = [];
  for (let i = 1; i <= 5; i++) {
    const raw = rawPresets[String(i)];
    slots.push(raw ? { groups: raw } : null);
  }
  return slots;
}

function usePresetLoader(setPresets: (presets: (GroupPreset | null)[]) => void) {
  useEffect(() => {
    api
      .getPresets()
      .then((data) => setPresets(parsePresets(data.presets)))
      .catch(() => {});
  }, [setPresets]);
}

type GroupZone = { id: string; label: string; deviceIds: string[] };

function useGroupZones(devices: Device[]) {
  const masters = devices.filter((d) => d.is_master);
  const masterIds = new Set(masters.map((d) => d.id));
  const groupedSlaveIds = new Set(
    devices.filter((d) => d.group_id && !d.is_master && masterIds.has(d.group_id)).map((d) => d.id)
  );
  const groups: GroupZone[] = masters.map((m) => ({
    id: m.id,
    label: m.name,
    deviceIds: [
      m.id,
      ...devices.filter((d) => d.group_id === m.id && !d.is_master).map((d) => d.id),
    ],
  }));
  const ungroupedDevices = devices.filter((d) => !groupedSlaveIds.has(d.id) && !d.is_master);
  return { groups, ungroupedDevices };
}

function useRemoveFromGroup(devices: Device[]) {
  return useCallback(
    async (deviceId: string) => {
      const device = devices.find((d) => d.id === deviceId);
      if (!device?.group_id) return;
      if (device.is_master) {
        await api.dissolveGroup(deviceId);
      } else {
        const remainingSlaves = devices.filter(
          (d) => d.group_id === device.group_id && !d.is_master && d.id !== deviceId
        );
        await api.dissolveGroup(device.group_id);
        if (remainingSlaves.length > 0) {
          await api.createGroup(
            device.group_id,
            remainingSlaves.map((d) => d.id)
          );
        }
      }
    },
    [devices]
  );
}

function useDrop(
  dragId: string | null,
  devices: Device[],
  removeFromCurrentGroup: (id: string) => Promise<void>,
  setDragOver: (id: string | null) => void,
  setDragId: (id: string | null) => void
) {
  return useCallback(
    async (targetZone: string) => {
      if (!dragId) return;
      const droppedId = dragId;
      setDragOver(null);
      setDragId(null);

      const device = devices.find((d) => d.id === droppedId);
      if (!device) return;

      if (targetZone === "ungroup") {
        await removeFromCurrentGroup(droppedId);
        return;
      }

      const targetDevice = devices.find((d) => d.id === targetZone);
      if (targetDevice && !targetDevice.is_master && !targetDevice.group_id) {
        if (targetZone === droppedId) return;
        await removeFromCurrentGroup(droppedId);
        await api.createGroup(targetZone, [droppedId]);
        return;
      }

      if (targetZone === device.group_id) return;
      await removeFromCurrentGroup(droppedId);
      const existingSlaves = devices.filter((d) => d.group_id === targetZone && !d.is_master);
      const allSlaveIds = [...existingSlaves.map((d) => d.id), droppedId];
      if (existingSlaves.length > 0) await api.dissolveGroup(targetZone);
      await api.createGroup(targetZone, allSlaveIds);
    },
    [dragId, devices, removeFromCurrentGroup, setDragOver, setDragId]
  );
}

// --- Sub-components ---

function DiscoveringState() {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Rooms</h2>
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📡</div>
        <div className="text-sm text-[var(--color-text-secondary)]">Discovering devices...</div>
      </div>
    </div>
  );
}

function PresetsBar({
  presets,
  onPresetClick,
  onPresetLongPress,
}: {
  presets: (GroupPreset | null)[];
  onPresetClick: (slot: number) => void;
  onPresetLongPress: (slot: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Presets</span>
      {presets.map((preset, i) => (
        <PresetButton
          key={i}
          slot={i}
          hasPreset={preset !== null}
          groupCount={preset?.groups.length ?? 0}
          onClick={() => onPresetClick(i)}
          onLongPress={() => onPresetLongPress(i)}
        />
      ))}
    </div>
  );
}

function DropZone({
  zoneId,
  onDragOver,
  onDragLeave,
  onDrop,
  className,
  children,
}: {
  zoneId: string;
  highlight?: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-zone={zoneId}
      className={className}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {children}
    </div>
  );
}

interface SpeakerListProps {
  devices: Device[];
  activeDeviceId: string | null;
  dragId: string | null;
  dragOver: string | null;
  isDragging: boolean;
  setDragId: (id: string | null) => void;
  setDragOver: (id: string | null) => void;
  setActiveDevice: (id: string) => void;
  handleDrop: (zone: string) => void;
  handleVolumeChange: (device: Device, value: number) => void;
  handleMuteToggle: (device: Device) => void;
  handleToggleEnabled: (device: Device) => void;
}

function GroupList({ groups, ...props }: SpeakerListProps & { groups: GroupZone[] }) {
  return (
    <>
      {groups.map((group) => (
        <DropZone
          key={group.id}
          zoneId={group.id}
          highlight={props.isDragging && props.dragOver === group.id}
          onDragOver={() => props.setDragOver(group.id)}
          onDragLeave={() => props.setDragOver(null)}
          onDrop={() => props.handleDrop(group.id)}
          className={`rounded-xl border p-2 transition-colors ${
            props.isDragging && props.dragOver === group.id
              ? "border-orange-400 bg-orange-400/5"
              : "border-orange-400/30 bg-[var(--color-surface-elevated)]/50"
          }`}
        >
          <div className="px-1 pt-0.5 pb-1.5 flex items-center gap-2">
            <GroupIcon />
            <span className="text-xs font-medium text-orange-400">Group</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {group.deviceIds.map((id, idx) => {
              const d = props.devices.find((dev) => dev.id === id);
              if (!d) return null;
              return (
                <SpeakerCard
                  key={id}
                  device={d}
                  isMaster={idx === 0}
                  isActive={id === props.activeDeviceId}
                  isDragging={props.dragId === id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", id);
                    e.dataTransfer.effectAllowed = "move";
                    props.setDragId(id);
                  }}
                  onDragEnd={() => {
                    props.setDragId(null);
                    props.setDragOver(null);
                  }}
                  onSelect={() => d.enabled && props.setActiveDevice(group.id)}
                  onVolumeChange={(v) => props.handleVolumeChange(d, v)}
                  onMuteToggle={() => props.handleMuteToggle(d)}
                  onToggleEnabled={() => props.handleToggleEnabled(d)}
                />
              );
            })}
          </div>
        </DropZone>
      ))}
    </>
  );
}

function UngroupedList(props: SpeakerListProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {props.devices.map((d) => (
        <DropZone
          key={d.id}
          zoneId={d.id}
          highlight={props.isDragging && props.dragOver === d.id && props.dragId !== d.id}
          onDragOver={() => props.setDragOver(d.id)}
          onDragLeave={() => props.setDragOver(null)}
          onDrop={() => props.handleDrop(d.id)}
          className={`rounded-xl transition-colors ${
            props.isDragging && props.dragOver === d.id && props.dragId !== d.id
              ? "ring-2 ring-[var(--color-accent)]"
              : ""
          }`}
        >
          <SpeakerCard
            device={d}
            isMaster={false}
            isActive={d.id === props.activeDeviceId}
            isDragging={props.dragId === d.id}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", d.id);
              e.dataTransfer.effectAllowed = "move";
              props.setDragId(d.id);
            }}
            onDragEnd={() => {
              props.setDragId(null);
              props.setDragOver(null);
            }}
            onSelect={() => d.enabled && props.setActiveDevice(d.id)}
            onVolumeChange={(v) => props.handleVolumeChange(d, v)}
            onMuteToggle={() => props.handleMuteToggle(d)}
            onToggleEnabled={() => props.handleToggleEnabled(d)}
          />
        </DropZone>
      ))}
    </div>
  );
}

function UngroupDropZone({
  dragOver,
  setDragOver,
  handleDrop,
}: {
  dragOver: string | null;
  setDragOver: (id: string | null) => void;
  handleDrop: (zone: string) => void;
}) {
  return (
    <DropZone
      zoneId="ungroup"
      highlight={dragOver === "ungroup"}
      onDragOver={() => setDragOver("ungroup")}
      onDragLeave={() => setDragOver(null)}
      onDrop={() => handleDrop("ungroup")}
      className={`rounded-xl border-2 border-dashed py-5 flex items-center justify-center gap-2 text-sm transition-colors ${
        dragOver === "ungroup"
          ? "border-red-400 bg-red-400/10 text-red-400"
          : "border-white/20 text-white/40"
      }`}
    >
      <UnlinkIcon />
      <span>Ungroup</span>
    </DropZone>
  );
}
