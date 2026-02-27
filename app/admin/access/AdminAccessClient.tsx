"use client";

import { useCallback, useEffect, useState } from "react";

type AppRole = "member" | "admin" | "owner";

interface ElevatedUser {
  id: string;
  email: string | null;
  name: string | null;
  app_role: AppRole;
}

export default function AdminAccessClient() {
  const [users, setUsers] = useState<ElevatedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("admin");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/roles", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load roles");
      }

      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), app_role: role }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update role");
      }

      setMessage(`Updated ${data.user?.email ?? email} to ${role}.`);
      setEmail("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={submitRole}
        className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4"
      >
        <h2 className="text-lg font-semibold text-white">Assign Role</h2>

        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@email.com"
            required
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-500 focus:outline-none"
          />

          <select
            value={role}
            onChange={(event) => setRole(event.target.value as AppRole)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save role"}
          </button>
        </div>

        {message && <p className="text-sm text-emerald-400">{message}</p>}
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </form>

      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Privileged Users</h2>
          <button
            onClick={loadUsers}
            disabled={loading}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-white disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-400">No owner/admin users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-2 text-white">{user.email || "-"}</td>
                    <td className="px-3 py-2 text-gray-300">{user.name || "-"}</td>
                    <td className="px-3 py-2 text-cyan-300">{user.app_role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
