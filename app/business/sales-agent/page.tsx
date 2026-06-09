import { redirect } from "next/navigation";

// Legacy route — the Sales Agent was renamed to the Messages inbox.
export default function BusinessSalesAgentPage() {
  redirect("/business/messages");
}
