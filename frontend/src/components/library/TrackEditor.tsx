import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type LibraryItem, type TagUpdate } from "../../api/client";

interface TrackEditorProps {
  track: LibraryItem;
  onClose: () => void;
}

export function TrackEditor({ track, onClose }: TrackEditorProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(track.title ?? "");
  const [artist, setArtist] = useState(track.artist ?? "");
  const [album, setAlbum] = useState(track.album ?? "");
  const [albumArtist, setAlbumArtist] = useState(track.album_artist ?? "");
  const [genre, setGenre] = useState(track.genre ?? "");
  const [trackNumber, setTrackNumber] = useState(track.track_number ?? "");
  const [discNumber, setDiscNumber] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const update = buildTagUpdate(track, {
      title,
      artist,
      album,
      albumArtist,
      genre,
      trackNumber,
      discNumber,
    });

    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }

    try {
      await api.updateTrack(track.id, update);
      queryClient.invalidateQueries({ queryKey: ["library"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogOverlay onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Edit Track</h2>
        <button onClick={onClose} className="text-[var(--color-text-secondary)] p-1">
          <XIcon />
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Artist" value={artist} onChange={setArtist} />
      <Field label="Album" value={album} onChange={setAlbum} />
      <Field label="Album Artist" value={albumArtist} onChange={setAlbumArtist} />
      <Field label="Genre" value={genre} onChange={setGenre} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Track #" value={trackNumber} onChange={setTrackNumber} type="number" />
        <Field label="Disc #" value={discNumber} onChange={setDiscNumber} type="number" />
      </div>

      <DialogFooter onCancel={onClose} onSubmit={handleSave} saving={saving} submitLabel="Save" />
    </DialogOverlay>
  );
}

function setIfChanged(update: TagUpdate, key: keyof TagUpdate, value: string, original: string) {
  if (value !== original) (update as Record<string, unknown>)[key] = value;
}

function buildTagUpdate(
  track: LibraryItem,
  fields: {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    genre: string;
    trackNumber: string;
    discNumber: string;
  }
): TagUpdate {
  const update: TagUpdate = {};
  setIfChanged(update, "title", fields.title, track.title ?? "");
  setIfChanged(update, "artist", fields.artist, track.artist ?? "");
  setIfChanged(update, "album", fields.album, track.album ?? "");
  setIfChanged(update, "album_artist", fields.albumArtist, track.album_artist ?? "");
  setIfChanged(update, "genre", fields.genre, track.genre ?? "");
  const tn = parseInt(fields.trackNumber, 10);
  if (!isNaN(tn) && fields.trackNumber !== (track.track_number ?? "")) update.track_number = tn;
  const dn = parseInt(fields.discNumber, 10);
  if (!isNaN(dn)) update.disc_number = dn;
  return update;
}

export function DialogOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60 appearance-none border-0 cursor-default"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div className="relative bg-[var(--color-surface)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

export function DialogFooter({
  onCancel,
  onSubmit,
  saving,
  submitLabel,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        onClick={onCancel}
        className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={saving}
        className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  id?: string;
}) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={inputId} className="block text-xs text-[var(--color-text-secondary)] mb-1">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
      />
    </div>
  );
}

interface BulkAlbumArtistDialogProps {
  containerId: string;
  currentArtist?: string;
  onClose: () => void;
}

export function BulkAlbumArtistDialog({
  containerId,
  currentArtist,
  onClose,
}: BulkAlbumArtistDialogProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(currentArtist ?? "");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.bulkSetAlbumArtist(containerId, value.trim());
      setResult({ success: res.success, failed: res.failed });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h2 className="text-lg font-semibold">Set Album Artist</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Set album artist for all tracks in this container.
      </p>
      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}
      {result ? (
        <BulkResultView result={result} onClose={onClose} />
      ) : (
        <BulkAlbumArtistForm
          value={value}
          onChange={setValue}
          saving={saving}
          onSave={handleSave}
          onClose={onClose}
        />
      )}
    </DialogOverlay>
  );
}

function BulkResultView({
  result,
  onClose,
}: {
  result: { success: number; failed: number };
  onClose: () => void;
}) {
  return (
    <>
      <div className="text-sm">
        Updated {result.success} track{result.success !== 1 ? "s" : ""}
        {result.failed > 0 && <span className="text-red-400"> ({result.failed} failed)</span>}
      </div>
      <button
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium"
      >
        Done
      </button>
    </>
  );
}

function BulkAlbumArtistForm({
  value,
  onChange,
  saving,
  onSave,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Album artist name"
        className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
      />
      <DialogFooter onCancel={onClose} onSubmit={onSave} saving={saving} submitLabel="Apply" />
    </>
  );
}

export { RenameArtistDialog } from "./RenameArtistDialog";

function XIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
