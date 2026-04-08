"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BUSINESS_APPEARANCE_UPDATED_EVENT,
  DEFAULT_BUSINESS_APPEARANCE,
  getBusinessAppearanceCssVariables,
  normalizeBusinessAppearance,
  normalizeHexColor,
  parseBusinessAppearanceInput,
} from "@/lib/business/appearance";
import type { BusinessAppearance } from "@/types";

type AppearanceResponse = BusinessAppearance & {
  canEdit: boolean;
};

function dispatchAppearanceUpdated(appearance: BusinessAppearance) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BUSINESS_APPEARANCE_UPDATED_EVENT, {
      detail: { appearance },
    })
  );
}

function normalizeDraftValue(value: string): string {
  const cleaned = value.trim().replace(/[^#0-9a-fA-F]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("#") ? cleaned.toUpperCase() : `#${cleaned.toUpperCase()}`;
}

function ColorField({
  label,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
}) {
  const normalized = normalizeHexColor(value) ?? DEFAULT_BUSINESS_APPEARANCE.primaryColor;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-[var(--biz-text)]">{label}</label>
        <span
          className="h-6 w-6 rounded-full border border-[var(--biz-border)]"
          style={{ background: normalized }}
        />
      </div>
      <div className="flex gap-3">
        <input
          type="color"
          value={normalized}
          onChange={(event) => onChange(event.target.value)}
          disabled={readOnly}
          className="h-11 w-14 cursor-pointer rounded-lg border border-[var(--biz-border)] bg-white p-1 disabled:cursor-not-allowed"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(normalizeDraftValue(event.target.value))}
          disabled={readOnly}
          placeholder="#1D9E75"
          maxLength={7}
          className="min-w-0 flex-1 rounded-lg border border-[var(--biz-border)] bg-white px-3 py-2 text-sm text-[var(--biz-text)] placeholder:text-[var(--biz-muted)] focus:border-[var(--biz-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--biz-focus)] disabled:cursor-not-allowed disabled:bg-[var(--biz-surface-soft)]"
        />
      </div>
    </div>
  );
}

export default function AppearanceSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedAppearance, setSavedAppearance] = useState<BusinessAppearance>(
    DEFAULT_BUSINESS_APPEARANCE
  );
  const [draft, setDraft] = useState<BusinessAppearance>(DEFAULT_BUSINESS_APPEARANCE);

  useEffect(() => {
    let isMounted = true;

    async function loadAppearance() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/business/appearance", {
          cache: "no-store",
        });
        const data = (await response.json()) as Partial<AppearanceResponse> & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Failed to load appearance");
        }
        const appearance = normalizeBusinessAppearance(data);
        if (!isMounted) return;
        setSavedAppearance(appearance);
        setDraft(appearance);
        setCanEdit(data.canEdit === true);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load appearance");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadAppearance();
    return () => {
      isMounted = false;
    };
  }, []);

  const parsedDraft = useMemo(
    () => parseBusinessAppearanceInput(draft),
    [draft]
  );
  const previewAppearance = useMemo(
    () => normalizeBusinessAppearance(parsedDraft.appearance ?? draft),
    [draft, parsedDraft.appearance]
  );
  const previewStyle = useMemo(
    () => getBusinessAppearanceCssVariables(previewAppearance),
    [previewAppearance]
  );
  const isDirty =
    JSON.stringify(savedAppearance) !== JSON.stringify(previewAppearance);

  async function saveAppearance(reset = false) {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/business/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reset
            ? { reset: true }
            : {
                primaryColor: draft.primaryColor,
                secondaryColor: draft.secondaryColor,
                tertiaryColor: draft.tertiaryColor,
              }
        ),
      });
      const data = (await response.json()) as Partial<AppearanceResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to save appearance");
      }

      const appearance = normalizeBusinessAppearance(data);
      setSavedAppearance(appearance);
      setDraft(appearance);
      setCanEdit(data.canEdit === true);
      setNotice(reset ? "Workspace palette reset." : "Workspace palette saved.");
      dispatchAppearanceUpdated(appearance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save appearance");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-6 shadow-[var(--biz-shadow-sm)]">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 rounded bg-[var(--biz-skeleton)]" />
          <div className="h-20 rounded-xl bg-[var(--biz-skeleton)]" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-16 rounded-lg bg-[var(--biz-skeleton)]" />
            <div className="h-16 rounded-lg bg-[var(--biz-skeleton)]" />
            <div className="h-16 rounded-lg bg-[var(--biz-skeleton)]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-6 shadow-[var(--biz-shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--biz-text)]">Appearance</h2>
          <p className="mt-1 text-sm text-[var(--biz-muted)]">
            Shared branding colors for the business workspace. White surfaces stay fixed for readability.
          </p>
        </div>
        <div className="rounded-full border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--biz-primary)]">
          Workspace palette
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-xl border border-[var(--biz-secondary-border)] bg-[var(--biz-secondary-soft)] px-4 py-3 text-sm text-[var(--biz-secondary)]">
          {notice}
        </div>
      ) : null}

      {!canEdit ? (
        <div className="mt-4 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-3 text-sm text-[var(--biz-muted)]">
          Only the workspace owner can update business-mode branding. You can preview the current palette here.
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)]">
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField
            label="Primary"
            value={draft.primaryColor}
            readOnly={!canEdit}
            onChange={(primaryColor) => setDraft((current) => ({ ...current, primaryColor }))}
          />
          <ColorField
            label="Secondary"
            value={draft.secondaryColor}
            readOnly={!canEdit}
            onChange={(secondaryColor) =>
              setDraft((current) => ({ ...current, secondaryColor }))
            }
          />
          <ColorField
            label="Tertiary"
            value={draft.tertiaryColor}
            readOnly={!canEdit}
            onChange={(tertiaryColor) =>
              setDraft((current) => ({ ...current, tertiaryColor }))
            }
          />
        </div>

        <div
          className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] p-4"
          style={previewStyle}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
            Mini Preview
          </p>
          <div className="mt-3 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-4 shadow-[var(--biz-shadow-sm)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--biz-text)]">Business Dashboard</p>
                <p className="text-xs text-[var(--biz-muted)]">Primary actions and shared accents</p>
              </div>
              <span className="rounded-full border border-[var(--biz-secondary-border)] bg-[var(--biz-secondary-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--biz-secondary)]">
                Secondary
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{
                  background: "var(--biz-primary)",
                  color: "var(--biz-primary-foreground)",
                }}
              >
                Primary CTA
              </button>
              <span className="rounded-lg border border-[var(--biz-tertiary-border)] bg-[var(--biz-tertiary-soft)] px-3 py-2 text-xs font-semibold text-[var(--biz-tertiary)]">
                Tertiary badge
              </span>
              <span className="rounded-lg border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--biz-primary)]">
                Profit accent
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--biz-muted)]">
          Accent colors drive buttons, links, badges, charts, and highlight states across `/business`.
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(DEFAULT_BUSINESS_APPEARANCE);
                void saveAppearance(true);
              }}
              disabled={saving}
              className="rounded-lg border border-[var(--biz-border)] px-4 py-2 text-sm font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset defaults
            </button>
            <button
              type="button"
              onClick={() => void saveAppearance(false)}
              disabled={saving || !isDirty || parsedDraft.error !== null}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--biz-primary)",
                color: "var(--biz-primary-foreground)",
              }}
            >
              {saving ? "Saving..." : "Save palette"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
