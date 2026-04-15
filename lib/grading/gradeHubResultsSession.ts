const GRADE_HUB_RESULTS_STORAGE_KEY = "gradeHubResultsSessions";
const GRADE_HUB_RESULTS_SESSION_LIMIT = 12;

export type GradeHubResultsSession = {
  id: string;
  createdAt: string;
  activeSlots: number;
  cardTitle: string;
  gradingCompany: "PSA" | "BGS" | "SGC";
  notes: string;
  quickFlags: string[];
  jobIds: string[];
  runIds: string[];
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `scan-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParseSessions(raw: string | null): GradeHubResultsSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function loadAllSessions(): GradeHubResultsSession[] {
  if (!isBrowser()) return [];
  return safeParseSessions(window.sessionStorage.getItem(GRADE_HUB_RESULTS_STORAGE_KEY));
}

function persistSessions(sessions: GradeHubResultsSession[]) {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(
    GRADE_HUB_RESULTS_STORAGE_KEY,
    JSON.stringify(sessions.slice(0, GRADE_HUB_RESULTS_SESSION_LIMIT))
  );
}

export function saveGradeHubResultsSession(
  session: Omit<GradeHubResultsSession, "id"> & { id?: string }
): GradeHubResultsSession {
  const normalized: GradeHubResultsSession = {
    ...session,
    id: session.id ?? makeSessionId(),
    cardTitle: session.cardTitle.trim(),
    notes: session.notes.trim(),
    quickFlags: Array.from(new Set(session.quickFlags.filter(Boolean))),
    jobIds: Array.from(new Set(session.jobIds.filter(Boolean))),
    runIds: Array.from(new Set(session.runIds.filter(Boolean))),
  };

  const existing = loadAllSessions().filter((item) => item.id !== normalized.id);
  persistSessions([normalized, ...existing]);
  return normalized;
}

export function loadGradeHubResultsSession(
  sessionId: string
): GradeHubResultsSession | null {
  if (!sessionId) return null;
  return loadAllSessions().find((session) => session.id === sessionId) ?? null;
}
