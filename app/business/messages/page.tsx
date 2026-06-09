import { redirect } from "next/navigation";

// The seller inbox moved into the marketplace seller area.
export default function BusinessMessagesPage() {
  redirect("/marketplace/sell/messages");
}
