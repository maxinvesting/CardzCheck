import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCardzcheckThread,
  getCardzcheckMessages,
} from "@/lib/messaging/adapters/cardzcheck";
import BuyerThreadView from "./BuyerThreadView";

export default async function MarketplaceThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/marketplace/messages/${threadId}`);
  }

  const [thread, messages] = await Promise.all([
    getCardzcheckThread(user.id, threadId),
    getCardzcheckMessages(user.id, threadId),
  ]);

  if (!thread) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-[14px] font-semibold text-white">
          Thread not found
        </p>
        <p className="mt-2 text-[12px] text-white/60">
          This conversation may have been removed or you may not have access.
        </p>
      </div>
    );
  }

  return (
    <BuyerThreadView
      threadId={threadId}
      initialThread={thread}
      initialMessages={messages}
    />
  );
}
