// /collection has been retired. The ledger at /business/ledger is now the
// single source of truth for inventory across all tiers (Free, Business,
// Business Pro). This file exists only as a server-side redirect so old
// bookmarks and emailed links keep working.
import { redirect } from "next/navigation";

export default function CollectionRedirect() {
  redirect("/business/ledger");
}
