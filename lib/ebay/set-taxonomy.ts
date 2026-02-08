export interface SetTaxonomyEntry {
  slug: string;
  requiredTerms: string[];
  aliases?: string[];
  allowsOtherSetTerms?: boolean;
}

export interface SetProfile {
  slug: string;
  requiredAll: string[];
  requiredAny: string[];
  forbidden: string[];
}

const SET_TAXONOMY: SetTaxonomyEntry[] = [
  {
    slug: "panini-prizm-draft-picks",
    requiredTerms: ["prizm", "draft picks"],
    aliases: ["panini prizm draft picks", "prizm draft picks"],
    allowsOtherSetTerms: false,
  },
  {
    slug: "panini-prizm",
    requiredTerms: ["prizm"],
    aliases: ["panini prizm"],
    allowsOtherSetTerms: false,
  },
  {
    slug: "panini-select",
    requiredTerms: ["select"],
    aliases: ["panini select"],
    allowsOtherSetTerms: false,
  },
  {
    slug: "panini-mosaic",
    requiredTerms: ["mosaic"],
    aliases: ["panini mosaic"],
    allowsOtherSetTerms: false,
  },
  {
    slug: "donruss-optic",
    requiredTerms: ["donruss", "optic"],
    aliases: ["donruss optic", "panini optic", "optic"],
    allowsOtherSetTerms: false,
  },
  {
    slug: "panini-playoff",
    requiredTerms: ["playoff"],
    aliases: ["panini playoff"],
    allowsOtherSetTerms: false,
  },
  {
    slug: "panini-chronicles",
    requiredTerms: ["chronicles"],
    aliases: ["panini chronicles"],
    allowsOtherSetTerms: true,
  },
  {
    slug: "panini-phoenix",
    requiredTerms: ["phoenix"],
    aliases: ["panini phoenix"],
    allowsOtherSetTerms: false,
  },
  {
    slug: "panini-donruss",
    requiredTerms: ["donruss"],
    aliases: ["panini donruss"],
    allowsOtherSetTerms: false,
  },
];

const SET_PROFILES: Record<string, SetProfile> = {
  panini_prizm: {
    slug: "panini_prizm",
    requiredAll: ["prizm"],
    requiredAny: [],
    forbidden: ["draft picks", "draftpick", "draft", "dp", "college", "ncaa", "lsu"],
  },
  panini_prizm_draft_picks: {
    slug: "panini_prizm_draft_picks",
    requiredAll: ["prizm"],
    requiredAny: ["draft picks", "draft", "dp"],
    forbidden: [],
  },
  panini_donruss: {
    slug: "panini_donruss",
    requiredAll: [],
    requiredAny: ["donruss"],
    forbidden: ["optic"],
  },
  panini_donruss_optic: {
    slug: "panini_donruss_optic",
    requiredAll: ["optic"],
    requiredAny: [],
    // IMPORTANT: Removed "prizm" from forbidden list to allow "Holo Prizm" listings
    // which are valid Optic parallels. Scoring logic will handle disambiguation.
    forbidden: ["mosaic", "select", "chronicles", "playoff"],
  },
  panini_select: {
    slug: "panini_select",
    requiredAll: [],
    requiredAny: ["select"],
    forbidden: [],
  },
  panini_mosaic: {
    slug: "panini_mosaic",
    requiredAll: [],
    requiredAny: ["mosaic"],
    forbidden: [],
  },
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTerm(term: string): string {
  return normalizeText(term);
}

function matchesEntry(textNormalized: string, entry: SetTaxonomyEntry): boolean {
  const required = entry.requiredTerms.map(normalizeTerm);
  return required.every((term) => textNormalized.includes(term));
}

function matchesAlias(textNormalized: string, entry: SetTaxonomyEntry): boolean {
  return (entry.aliases ?? [])
    .map(normalizeTerm)
    .some((alias) => textNormalized.includes(alias));
}

export function resolveSetTaxonomy(setName: string): SetTaxonomyEntry | null {
  const normalized = normalizeText(setName || "");
  if (!normalized) return null;

  let best: { entry: SetTaxonomyEntry; score: number } | null = null;
  for (const entry of SET_TAXONOMY) {
    const requiredMatch = matchesEntry(normalized, entry);
    const aliasMatch = matchesAlias(normalized, entry);
    if (!requiredMatch && !aliasMatch) continue;

    const termLengths = entry.requiredTerms
      .map((term) => normalizeTerm(term).length)
      .reduce((sum, len) => sum + len, 0);
    const score = entry.requiredTerms.length * 10 + termLengths + (aliasMatch ? 1 : 0);

    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  return best?.entry ?? null;
}

export function classifyListingSet(title: string): SetTaxonomyEntry | null {
  const normalized = normalizeText(title || "");
  if (!normalized) return null;

  let best: { entry: SetTaxonomyEntry; score: number } | null = null;
  for (const entry of SET_TAXONOMY) {
    const requiredMatch = matchesEntry(normalized, entry);
    const aliasMatch = matchesAlias(normalized, entry);
    if (!requiredMatch && !aliasMatch) continue;

    const termLengths = entry.requiredTerms
      .map((term) => normalizeTerm(term).length)
      .reduce((sum, len) => sum + len, 0);
    const score = entry.requiredTerms.length * 10 + termLengths + (aliasMatch ? 1 : 0);

    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  return best?.entry ?? null;
}

export function getDerivedExcludeTerms(selectedSlug: string | null): string[] {
  const selected = selectedSlug
    ? SET_TAXONOMY.find((entry) => entry.slug === selectedSlug)
    : null;
  if (!selected || selected.allowsOtherSetTerms) return [];

  const selectedTerms = new Set(selected.requiredTerms.map(normalizeTerm));
  const exclude = new Set<string>();
  for (const entry of SET_TAXONOMY) {
    if (entry.slug === selected.slug) continue;
    for (const term of entry.requiredTerms) {
      const normalized = normalizeTerm(term);
      if (!selectedTerms.has(normalized)) {
        exclude.add(normalized);
      }
    }
  }

  return Array.from(exclude);
}

export function matchesSelectedSet(title: string, selected: SetTaxonomyEntry | null): boolean {
  if (!selected) return true;
  const normalized = normalizeText(title || "");
  if (!normalized) return false;
  return matchesEntry(normalized, selected) || matchesAlias(normalized, selected);
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function getSetProfile(setName?: string | null): SetProfile | null {
  if (!setName) return null;
  const taxonomy = resolveSetTaxonomy(setName);
  if (taxonomy && SET_PROFILES[taxonomy.slug.replace(/-/g, "_")]) {
    return SET_PROFILES[taxonomy.slug.replace(/-/g, "_")];
  }
  const slug = normalizeSlug(setName);
  return SET_PROFILES[slug] ?? null;
}
