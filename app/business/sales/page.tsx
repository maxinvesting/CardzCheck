import { redirect } from "next/navigation";

export default function BusinessSalesPage() {
  redirect("/business/ledger?tab=sales");
}
