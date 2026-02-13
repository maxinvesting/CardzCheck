type PublicUrlResolver = {
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

export const normalizeHttpsImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }

  return parsed.toString();
};

export const pickFirstHttpsImageUrl = (candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    const normalized = normalizeHttpsImageUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

export const resolveStoredCardImageUrl = (
  supabase: PublicUrlResolver,
  storagePath: string | null | undefined
): string | null => {
  if (!storagePath) return null;

  const directUrl = normalizeHttpsImageUrl(storagePath);
  if (directUrl) {
    return directUrl;
  }

  const generated = supabase.storage
    .from("card-images")
    .getPublicUrl(storagePath).data.publicUrl;
  return normalizeHttpsImageUrl(generated);
};

