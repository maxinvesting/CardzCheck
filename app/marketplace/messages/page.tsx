/**
 * Buyer-side marketplace inbox. Shows the threads where the current user is
 * the buyer. Lightweight single-pane list; tapping a row routes into the
 * conversation view.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCardzcheckBuyerThreads } from "@/lib/messaging/adapters/cardzcheck";

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function MarketplaceMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/marketplace/messages");
  }

  const threads = await getCardzcheckBuyerThreads(user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[20px] font-semibold tracking-tight text-white">
          Messages
        </h1>
        <Link
          href="/marketplace"
          className="text-[12px] font-medium text-white/60 hover:text-white"
        >
          ← Marketplace
        </Link>
      </header>

      {threads.length === 0 ? (
        <div className="rounded-md border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-white">No conversations yet</p>
          <p className="mt-1 text-[12px] text-white/60">
            Message a seller from a listing or after you check out and your
            threads will show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-md border border-white/10 bg-white/[0.02]">
          {threads.map((thread) => {
            const hasUnread = thread.unread_count > 0;
            return (
              <li key={thread.id}>
                <Link
                  href={`/marketplace/messages/${thread.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`truncate text-[13px] ${
                          hasUnread ? "font-semibold text-white" : "text-white/80"
                        }`}
                      >
                        {thread.buyer_display_name ?? thread.buyer_username}
                      </p>
                      {hasUnread ? (
                        <span className="rounded-sm border border-white/30 bg-white/15 px-1.5 py-px text-[10px] font-semibold text-white">
                          {thread.unread_count}
                        </span>
                      ) : null}
                    </div>
                    {thread.item_title ? (
                      <p className="mt-0.5 truncate text-[12px] text-white/60">
                        {thread.item_title}
                      </p>
                    ) : null}
                    <p className="mt-1 line-clamp-1 text-[12px] text-white/50">
                      {thread.last_message_preview ?? "No messages yet."}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11px] text-white/40">
                    {formatRelative(thread.last_message_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
