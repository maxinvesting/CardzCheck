import { redirect } from "next/navigation";

// Legacy route — the Business Advisor now lives in the Assistants suite.
export default function LegacyBusinessConsultantPage() {
  redirect("/assistants/advisor");
}
