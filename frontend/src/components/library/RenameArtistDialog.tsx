import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DialogOverlay, DialogFooter, Field } from "./TrackEditor";

type RenameField = "both" | "artist" | "album_artist";

interface RenameArtistDialogProps {
  initialFrom?: string;
  onClose: () => void;
}

export function RenameArtistDialog({ initialFrom, onClose }: RenameArtistDialogProps) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState("");
  const [field, setField] = useState<RenameField>("both");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ total: number; success: number; failed: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!from.trim() || !to.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.bulkRenameArtist(from.trim(), to.trim(), field);
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ["library"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h2 className="text-lg font-semibold">Rename Artist</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Find and replace artist names across all matching tracks.
      </p>
      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}
      {result ? (
        <RenameResultView result={result} onClose={onClose} />
      ) : (
        <RenameForm
          from={from}
          to={to}
          field={field}
          onFromChange={setFrom}
          onToChange={setTo}
          onFieldChange={setField}
          saving={saving}
          onSave={handleSave}
          onClose={onClose}
        />
      )}
    </DialogOverlay>
  );
}

function RenameResultView({
  result,
  onClose,
}: {
  result: { total: number; success: number; failed: number };
  onClose: () => void;
}) {
  return (
    <>
      <div className="text-sm">
        {result.total === 0 ? (
          "No matching tracks found."
        ) : (
          <>
            Renamed {result.success} of {result.total} track{result.total !== 1 ? "s" : ""}
            {result.failed > 0 && <span className="text-red-400"> ({result.failed} failed)</span>}
          </>
        )}
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

function fieldLabel(f: string): string {
  if (f === "both") return "Both";
  if (f === "artist") return "Artist";
  return "Album Artist";
}

function RenameForm({
  from,
  to,
  field,
  onFromChange,
  onToChange,
  onFieldChange,
  saving,
  onSave,
  onClose,
}: {
  from: string;
  to: string;
  field: RenameField;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onFieldChange: (f: RenameField) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <Field label="From" value={from} onChange={onFromChange} id="rename-from" />
      <Field label="To" value={to} onChange={onToChange} id="rename-to" />
      <div>
        <span className="block text-xs text-[var(--color-text-secondary)] mb-1.5">Apply to</span>
        <div className="flex gap-2">
          {(["both", "artist", "album_artist"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFieldChange(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                field === f
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]"
              }`}
            >
              {fieldLabel(f)}
            </button>
          ))}
        </div>
      </div>
      <DialogFooter onCancel={onClose} onSubmit={onSave} saving={saving} submitLabel="Rename" />
    </>
  );
}
