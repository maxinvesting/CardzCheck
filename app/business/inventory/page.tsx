import { redirect } from "next/navigation";

export default function BusinessInventoryPage() {
  redirect("/business/ledger?tab=inventory");
}
