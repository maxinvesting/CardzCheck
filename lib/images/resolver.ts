import "server-only";

import type { CardImage, CardImageSource, TrustedCardImage } from "@/types";
import { getItemCertNumber, isCertImageSource } from "@/lib/images/cert-image";
import {
  buildTrustedCardImage,
  normalizeTrustedImageUrl,
  pickUserCardImages,
  resolveStoredImagePath,
  sortCardImages,
} from "@/lib/images/shared";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

export type TrustedImageRow = {
  id?: string | null;
  user_id?: string | null;
  grading_company?: string | null;
  cert_number?: string | null;
  psa_cert_number?: string | null;
  image_url?: string | null;
  image_source?: CardImageSource | null;
  user_image_url?: string | null;
};

export async function loadCardImagesForItem(
  supabase: SupabaseLike,
  itemId: string | null | undefined,
  userId?: string | null
): Promise<CardImage[]> {
  if (!itemId) return [];

  let query = supabase
    .from("card_images")
    .select("*")
    .eq("card_id", itemId)
    .order("position", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[images] card_images query failed:", error.message ?? error);
    return [];
  }

  const images = ((data ?? []) as CardImage[]).map((image) => ({
    ...image,
    url: resolveStoredImagePath(
      image.storage_path,
      (path) => supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl
    ) ?? undefined,
  }));

  return sortCardImages(images);
}

export async function resolveTrustedCardImageForItem(params: {
  supabase: SupabaseLike;
  item: TrustedImageRow;
  itemId?: string | null;
  userId?: string | null;
  cardImages?: CardImage[] | null;
}): Promise<{
  trustedImage: TrustedCardImage;
  cardImages: CardImage[];
  primaryImage: CardImage | null;
  imageSource: CardImageSource;
  imageUrl: string | null;
  psaCertNumber: string | null;
}> {
  const cardImages =
    params.cardImages ??
    (await loadCardImagesForItem(
      params.supabase,
      params.itemId ?? params.item.id ?? null,
      params.userId ?? params.item.user_id ?? null
    ));

  const certNumber = getItemCertNumber(params.item);
  const userImages = pickUserCardImages(cardImages, {
    legacyUserImageUrl: params.item.user_image_url ?? null,
    derivedImageUrl: params.item.image_url ?? null,
    imageSource: params.item.image_source ?? null,
  });

  const trustedImage = buildTrustedCardImage({
    certFrontUrl: isCertImageSource(params.item.image_source ?? null)
      ? normalizeTrustedImageUrl(params.item.image_url ?? null)
      : null,
    certBackUrl: null,
    certImageSource: isCertImageSource(params.item.image_source ?? null)
      ? params.item.image_source ?? null
      : null,
    userFrontUrl: userImages.frontUrl,
    userBackUrl: userImages.backUrl,
  });

  return {
    trustedImage,
    cardImages,
    primaryImage: cardImages[0] ?? null,
    imageSource: trustedImage.source,
    imageUrl: trustedImage.frontUrl,
    psaCertNumber: params.item.image_source === "psa" ? certNumber : null,
  };
}

export async function hydrateTrustedImagesForItems<T extends TrustedImageRow>(params: {
  supabase: SupabaseLike;
  items: T[];
  userId?: string | null;
}): Promise<Array<T & {
  trusted_image: TrustedCardImage;
  card_images: CardImage[];
  primary_image: CardImage | null;
  image_source: CardImageSource;
  image_url: string | null;
  psa_cert_number: string | null;
}>> {
  const hydrated = await Promise.all(
    params.items.map(async (item) => {
      const resolved = await resolveTrustedCardImageForItem({
        supabase: params.supabase,
        item,
        itemId: item.id ?? null,
        userId: params.userId ?? item.user_id ?? null,
      });

      return {
        ...item,
        trusted_image: resolved.trustedImage,
        card_images: resolved.cardImages,
        primary_image: resolved.primaryImage,
        image_source: resolved.imageSource,
        image_url: resolved.imageUrl,
        psa_cert_number: resolved.psaCertNumber,
      };
    })
  );

  return hydrated;
}
