import { redirect } from "next/navigation";

// Legacy route — the Sales Agent became the seller inbox, now in the
// marketplace seller area.
export default function BusinessSalesAgentPage() {
  redirect("/marketplace/sell/messages");
}
