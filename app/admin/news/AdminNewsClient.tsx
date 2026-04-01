"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type AnnouncementCategory = "general" | "platform" | "grading" | "market" | "business";

interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  is_public: boolean;
  is_pinned: boolean;
  published_at: string;
  created_at: string;
}

interface FormState {
  title: string;
  body: string;
  category: AnnouncementCategory;
  is_public: boolean;
  is_pinned: boolean;
  published_at: string;
}

const CATEGORIES: { value: AnnouncementCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "platform", label: "Platform" },
  { value: "grading", label: "Grading" },
  { value: "market", label: "Market" },
  { value: "business", label: "Business (members only)" },
];

const CATEGORY_COLORS: Record<AnnouncementCategory, string> = {
  general: "bg-gray-800 text-gray-300",
  platform: "bg-cyan-900/60 text-cyan-300",
  grading: "bg-blue-900/60 text-blue-300",
  market: "bg-emerald-900/60 text-emerald-300",
  business: "bg-violet-900/60 text-violet-300",
};

function toLocalDatetimeValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultForm(): FormState {
  return {
    title: "",
    body: "",
    category: "general",
    is_public: true,
    is_pinned: false,
    published_at: toLocalDatetimeValue(new Date().toISOString()),
  };
}

function AnnouncementForm({
  initial,
  onSubmit,
  submitLabel,
  submitting,
  error,
  onCancel,
}: {
  initial: FormState;
  onSubmit: (form: FormState) => void;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      <label className="block space-y-1 text-sm">
        <span className="text-gray-300">Title *</span>
        <input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600"
          placeholder="What's the headline?"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-gray-300">Body *</span>
        <textarea
          value={form.body}
          onChange={(e) => set("body", e.target.value)}
          required
          rows={5}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600"
          placeholder="Write the full announcement here…"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <span className="text-gray-300">Category *</span>
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value as AnnouncementCategory)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 text-sm">
          <span className="text-gray-300">Publish date &amp; time</span>
          <input
            type="datetime-local"
            value={form.published_at}
            onChange={(e) => set("published_at", e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
          <p className="text-xs text-gray-500">Set in the future to schedule.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 hover:border-gray-600">
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={(e) => set("is_public", e.target.checked)}
            className="rounded border-gray-600"
          />
          Public (visible to all users)
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 hover:border-gray-600">
          <input
            type="checkbox"
            checked={form.is_pinned}
            onChange={(e) => set("is_pinned", e.target.checked)}
            className="rounded border-gray-600"
          />
          Pinned (always shows first)
        </label>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function AdminNewsClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createForm] = useState<FormState>(defaultForm());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInitial, setEditInitial] = useState<FormState>(defaultForm());
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/news", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load.");
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const handleCreate = async (form: FormState) => {
    setCreateSubmitting(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          published_at: new Date(form.published_at).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create.");
      setCreateSuccess("Announcement published.");
      await loadAnnouncements();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setEditInitial({
      title: a.title,
      body: a.body,
      category: a.category,
      is_public: a.is_public,
      is_pinned: a.is_pinned,
      published_at: toLocalDatetimeValue(a.published_at),
    });
    setEditError(null);
  };

  const handleEdit = async (form: FormState) => {
    if (!editingId) return;
    setEditSubmitting(true);
    setEditError(null);

    try {
      const res = await fetch("/api/admin/news", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...form,
          published_at: new Date(form.published_at).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save.");
      setEditingId(null);
      await loadAnnouncements();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/news?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to delete.");
      await loadAnnouncements();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  };

  const quickToggle = async (a: Announcement, field: "is_pinned" | "is_public") => {
    try {
      const res = await fetch("/api/admin/news", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, [field]: !a[field] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed.");
      await loadAnnouncements();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Create form */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">New announcement</h2>
            <p className="text-sm text-gray-400">
              Write an update — it will appear on the News page for all matching users.
            </p>
          </div>
          <Link
            href="/news"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-600 hover:text-white"
          >
            View news page
          </Link>
        </div>

        <AnnouncementForm
          initial={createForm}
          onSubmit={handleCreate}
          submitLabel="Publish announcement"
          submitting={createSubmitting}
          error={createError}
        />

        {createSuccess && (
          <p className="mt-3 text-sm text-emerald-400">{createSuccess}</p>
        )}
      </section>

      {/* Announcement list */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">
            All announcements
            {!loading && (
              <span className="ml-2 text-base font-normal text-gray-400">
                ({announcements.length})
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-gray-400">No announcements yet.</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => {
              const isEditing = editingId === a.id;
              const isScheduled = new Date(a.published_at) > new Date();

              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-gray-700 bg-gray-900 p-4"
                >
                  {isEditing ? (
                    <AnnouncementForm
                      initial={editInitial}
                      onSubmit={handleEdit}
                      submitLabel="Save changes"
                      submitting={editSubmitting}
                      error={editError}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {a.is_pinned && (
                              <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
                                Pinned
                              </span>
                            )}
                            {isScheduled && (
                              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-400">
                                Scheduled
                              </span>
                            )}
                            {!a.is_public && (
                              <span className="rounded bg-rose-900/50 px-1.5 py-0.5 text-[11px] text-rose-300">
                                Business only
                              </span>
                            )}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[a.category]}`}
                            >
                              {a.category}
                            </span>
                          </div>
                          <p className="mt-1 font-semibold text-white">{a.title}</p>
                          <p className="mt-1 text-sm text-gray-400 line-clamp-2">{a.body}</p>
                          <p className="mt-1.5 text-xs text-gray-500">
                            {isScheduled ? "Publishes" : "Published"}{" "}
                            {new Date(a.published_at).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            onClick={() => quickToggle(a, "is_pinned")}
                            className={`rounded border px-2 py-1 text-xs ${
                              a.is_pinned
                                ? "border-amber-700 text-amber-300 hover:border-amber-500"
                                : "border-gray-700 text-gray-300 hover:border-gray-500"
                            }`}
                          >
                            {a.is_pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            onClick={() => quickToggle(a, "is_public")}
                            className={`rounded border px-2 py-1 text-xs ${
                              a.is_public
                                ? "border-gray-700 text-gray-300 hover:border-gray-500"
                                : "border-rose-800 text-rose-300 hover:border-rose-600"
                            }`}
                          >
                            {a.is_public ? "Make private" : "Make public"}
                          </button>
                          <button
                            onClick={() => openEdit(a)}
                            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-gray-500"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            className="rounded border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:border-rose-600 disabled:opacity-50"
                          >
                            {deletingId === a.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
