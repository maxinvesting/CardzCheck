import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { resolveTrustedCardImageForItem } from "@/lib/images/resolver";

type CollectionBackfillRow = {
  id: string;
  user_id: string;
  item_kind?: string | null;
  title?: string | null;
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  cert_number?: string | null;
  psa_cert_number?: string | null;
  image_url?: string | null;
  image_source?: "psa" | "user" | "none" | null;
  user_image_url?: string | null;
  acquisition_date?: string | null;
  cost_basis_total_cents?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BusinessBackfillRow = {
  id: string;
  user_id: string;
  card_id: string | null;
  title: string | null;
  grade: string | null;
  grading_company: string | null;
  cert_number: string | null;
  psa_cert_number?: string | null;
  image_url?: string | null;
  image_source?: "psa" | "user" | "none" | null;
  user_image_url?: string | null;
  acquisition_date: string | null;
  cost_basis_total_cents: number | null;
  created_at: string;
  updated_at: string | null;
};

function derivePlayerNameFromBusinessTitle(title: string | null | undefined): string {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled card";
}

export async function ensureCanonicalCollectionItemForBusinessItem(
  businessItemId: string
): Promise<string | null> {
  const supabase = await createServiceClient();
  const { data: businessItem, error } = await supabase
    .from("business_inventory_items")
    .select(
      "id,user_id,card_id,title,grade,grading_company,cert_number,psa_cert_number,image_url,image_source,user_image_url,acquisition_date,cost_basis_total_cents,created_at,updated_at"
    )
    .eq("id", businessItemId)
    .maybeSingle();

  if (error || !businessItem) {
    return null;
  }

  const business = businessItem as BusinessBackfillRow;
  const linkedId = business.card_id?.trim() || null;

  if (linkedId) {
    const { data: linkedCollectionItem } = await supabase
      .from("collection_items")
      .select("id")
      .eq("id", linkedId)
      .maybeSingle();

    if (linkedCollectionItem) {
      return linkedId;
    }
  }

  const canonicalId = business.id;
  const { data: existingCollectionItem } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", canonicalId)
    .maybeSingle();

  if (!existingCollectionItem) {
    const insertPayload = {
      id: canonicalId,
      user_id: business.user_id,
      item_kind: "inventory",
      title: business.title,
      player_name: derivePlayerNameFromBusinessTitle(business.title),
      year: null,
      set_name: null,
      grade: business.grade,
      grading_company: business.grading_company,
      cert_number: business.cert_number,
      psa_cert_number: business.psa_cert_number ?? business.cert_number ?? null,
      purchase_price:
        typeof business.cost_basis_total_cents === "number"
          ? business.cost_basis_total_cents / 100
          : null,
      purchase_date: business.acquisition_date,
      acquisition_date: business.acquisition_date,
      cost_basis_total_cents: business.cost_basis_total_cents ?? 0,
      condition_status: business.grade ? "graded" : "raw",
      channel: "other",
      status: "unlisted",
      image_url: business.image_url ?? null,
      image_source: business.image_source ?? "none",
      user_image_url: business.user_image_url ?? null,
      created_at: business.created_at,
      updated_at: business.updated_at ?? business.created_at,
    };

    const { error: insertError } = await supabase
      .from("collection_items")
      .insert(insertPayload);

    if (insertError) {
      throw insertError;
    }
  }

  await supabase
    .from("business_inventory_items")
    .update({ card_id: canonicalId })
    .eq("id", business.id);

  return canonicalId;
}

export async function syncTrustedImageFieldsForItem(itemId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { data: item } = await supabase
    .from("collection_items")
    .select("id,user_id,cert_number,psa_cert_number,image_url,image_source,user_image_url")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return;

  const resolved = await resolveTrustedCardImageForItem({
    supabase,
    item: item as CollectionBackfillRow,
    itemId,
    userId: (item as CollectionBackfillRow).user_id,
  });

  const updatePayload = {
    psa_cert_number: resolved.psaCertNumber,
    image_source: resolved.imageSource,
    image_url: resolved.imageUrl,
  };

  await supabase
    .from("collection_items")
    .update(updatePayload)
    .eq("id", itemId);

  await supabase
    .from("business_inventory_items")
    .update(updatePayload)
    .or(`id.eq.${itemId},card_id.eq.${itemId}`);

  await supabase
    .from("cards")
    .update(updatePayload)
    .eq("id", itemId);
}
