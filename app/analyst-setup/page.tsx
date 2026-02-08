"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const SUPABASE_SQL_EDITOR_BASE = "https://supabase.com/dashboard/project";

export default function AnalystSetupPage() {
  const [sql, setSql] = useState<string | null>(null);
  const [usersSql, setUsersSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [usersCopied, setUsersCopied] = useState(false);
  const [projectRef, setProjectRef] = useState<string>("");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) {
      try {
        const ref = new URL(url).hostname.split(".")[0];
        setProjectRef(ref);
      } catch {
        setProjectRef("");
      }
    }

    fetch("/api/analyst/setup-sql")
      .then((res) => (res.ok ? res.text() : null))
      .then(setSql)
      .catch(() => setSql(null));

    fetch("/api/analyst/setup-sql?migration=users")
      .then((res) => (res.ok ? res.text() : null))
      .then(setUsersSql)
      .catch(() => setUsersSql(null));
  }, []);

  const sqlEditorUrl =
    projectRef && `${SUPABASE_SQL_EDITOR_BASE}/${projectRef}/sql/new`;

  const copySql = () => {
    if (!sql) return;
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyUsersSql = () => {
    if (!usersSql) return;
    navigator.clipboard.writeText(usersSql).then(() => {
      setUsersCopied(true);
      setTimeout(() => setUsersCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8">
        <Link
          href="/analyst"
          className="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm"
        >
          ← Back to CardzCheck Analyst
        </Link>

        <h1 className="text-2xl font-bold text-white">
          One-time setup: Analyst tables
        </h1>
        <p className="text-gray-400">
          CardzCheck Analyst needs two tables in your Supabase project. Do this
          once:
        </p>

        <ol className="list-decimal list-inside space-y-3 text-gray-300">
          <li>
            <button
              type="button"
              onClick={copySql}
              disabled={!sql}
              className="text-blue-400 hover:text-blue-300 disabled:opacity-50 font-medium"
            >
              {copied ? "Copied!" : "Copy the SQL below"}
            </button>
          </li>
          <li>
            {sqlEditorUrl ? (
              <a
                href={sqlEditorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                Open your Supabase SQL Editor (opens in a new tab)
              </a>
            ) : (
              <span className="text-gray-500">
                Open Supabase Dashboard → SQL Editor → New query
              </span>
            )}
          </li>
          <li>Paste the SQL into the editor and click <strong>Run</strong>.</li>
        </ol>

        {sql ? (
          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto max-h-[50vh] overflow-y-auto">
            <code>{sql}</code>
          </pre>
        ) : (
          <p className="text-amber-400">Loading SQL…</p>
        )}

        <hr className="border-gray-700" />

        <h2 className="text-lg font-semibold text-white">
          If you see &quot;Failed to verify user&quot;
        </h2>
        <p className="text-gray-400 text-sm">
          Run this second migration so the <code className="text-gray-300">users</code> table
          exists and has the <code className="text-gray-300">analyst_queries_used</code> column:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
          <li>
            <button
              type="button"
              onClick={copyUsersSql}
              disabled={!usersSql}
              className="text-blue-400 hover:text-blue-300 disabled:opacity-50 font-medium"
            >
              {usersCopied ? "Copied!" : "Copy the users migration SQL"}
            </button>
          </li>
          <li>Open Supabase SQL Editor (same as above), paste, and click <strong>Run</strong>.</li>
        </ol>
        {usersSql ? (
          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto max-h-[40vh] overflow-y-auto">
            <code>{usersSql}</code>
          </pre>
        ) : (
          <p className="text-amber-400 text-sm">Loading users SQL…</p>
        )}

        <p className="text-sm text-gray-500">
          After both run successfully, go back to{" "}
          <Link href="/analyst" className="text-blue-400 hover:text-blue-300">
            CardzCheck Analyst
          </Link>{" "}
          and start a new chat.
        </p>
      </div>
    </div>
  );
}
