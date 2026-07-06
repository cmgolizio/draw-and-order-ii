"use client";

/**
 * Handle editing on the dossier (Phase 5). Client-side checkHandle gives fast
 * feedback; POST /api/profile re-runs it authoritatively (plus uniqueness).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiErrorBody } from "@/lib/game/api-types";
import { checkHandle, HANDLE_MAX_LENGTH } from "@/lib/game/handle";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";

export function HandleEditor({ handle }: { handle: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(handle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const check = checkHandle(value);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: check.handle }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
        setError(body?.error || "Couldn't update the roster. Try again.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the precinct. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <EvidenceTag>{handle}</EvidenceTag>
        <button
          type="button"
          onClick={() => {
            setValue(handle);
            setError(null);
            setEditing(true);
          }}
          className="type-label cursor-pointer text-xs text-ink-faint underline underline-offset-2 hover:text-ink-soft"
        >
          Edit handle
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="handle-input" className="sr-only">
          Detective handle
        </label>
        <input
          id="handle-input"
          type="text"
          value={value}
          maxLength={HANDLE_MAX_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="font-typewriter border border-graphite-300 bg-paper px-3 py-2 text-sm text-ink"
          autoFocus
        />
        <InkButton variant="blue" onClick={save} disabled={busy} className="!px-3 !py-2 !text-xs">
          {busy ? "Filing…" : "Save"}
        </InkButton>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="type-label cursor-pointer text-xs text-ink-faint underline underline-offset-2"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-stamp-red-deep">
          {error}
        </p>
      )}
    </div>
  );
}