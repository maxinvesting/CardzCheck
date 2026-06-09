# Sales Agent — Revision Plan

**Status:** Complete (Phases 0–3 + unread badge shipped 2026-06-08)
**Decision:** Revise + scope down (do **not** delete)
**Owner:** TBD
**Created:** 2026-06-08

> **Implemented 2026-06-08:** Renamed "Sales Agent" → "Messages" (`/business/sales-agent`
> → redirect to `/business/messages`). eBay messaging gated off via `EBAY_MESSAGING_ENABLED`
> in `lib/messaging/service.ts` (adapter retained, reversible). Removed auto-resolve/archive
> theater, the eBay/CC platform toggle, the draft pre-warm (drafts now on-demand), and the
> "Agent activity"/"Agent cleared" UI. Stripped debug logging. Empty/error states reframed to
> the CardzCheck marketplace.
>
> **Unread badge:** `GET /api/business/messages/unread-count` + `useSellerUnreadCount` hook;
> count rolled up onto the Sidebar "Ledger" item and shown on the Messages SectionTab.
>
> **Phase 3 (render hardening):** removed the vestigial briefing fetch (it discarded a Claude
> call + overview computation on every mount/refresh) and deleted the orphaned briefing route,
> `AgentBriefing` component, and `lib/messaging/briefing.ts`; replaced the mount-refresh
> `eslint-disable` with a ref-to-latest pattern. The eBay Trading-API XML-parser hardening
> noted below stays deferred because eBay messaging is gated off (Option B) — revisit only if
> eBay is ever re-enabled.
>
> **Relocation:** the seller inbox moved out of the business-workspace Ledger group into the
> marketplace seller area at `/marketplace/sell/messages`, alongside Listings and Orders (new
> SectionTabs group). `/business/messages` and `/business/sales-agent` redirect there. The
> Sidebar unread badge moved from the Ledger item to the Marketplace item. Also removed the
> eBay-keyed empty-state retry that surfaced a misleading "Background sync retried" notice.
>
> **Freemium (decision: free inbox, paid AI):** resolved the "selling is open but messaging is
> paywalled" inconsistency. Any authenticated marketplace seller can read/reply to buyers —
> `GET /api/business/messages` (returns `isBusiness`) and `GET/POST
> /api/business/messages/[threadId]` are auth-only, RLS-scoped to the participant. The AI
> deal-desk stays business-gated: `ai-reply` keeps `requireBusinessOwnerContext`, and the UI
> hides auto-draft, NegotiationPanel, Re-draft, "Other replies", and the batch Review button for
> free sellers, replacing them with an "upgrade to Business" nudge. Free sellers keep the
> compose box + Send. `hasBusinessOwnerAccess` (non-throwing) added to `lib/business/context`.

---

## TL;DR

The Sales Agent (a unified eBay + CardzCheck seller messaging "deal desk" with AI-drafted
replies) has real value and a clean core, but it's being held up by two specific liabilities
bolted onto it:

1. **A load-bearing dependency on eBay's legacy Trading API** for buyer messaging, parsed with
   hand-rolled regex over XML — and **eBay has no supported REST successor** for buyer↔seller
   messaging (see Background).
2. **An "Agent" automation layer that is mostly theater** — client-side-only auto-resolve that
   can hide real threads, plus eager AI draft pre-warming that spends money on every page load.

We keep the messaging domain and the CardzCheck path, quarantine the fragile eBay path, strip
the misleading/expensive automation, and rename away from "Agent" until real automation exists.

---

## Background: the eBay messaging API reality

- The pre-sale buyer-question integration uses the **Trading API** calls `GetMemberMessages`
  (read) and `AddMemberMessageRTQ` (send), hitting `https://api.ebay.com/ws/api.dll` directly
  with the auth token embedded in the XML body. Parsing is regex-over-XML in
  `lib/messaging/adapters/ebay.ts`.
- eBay is steadily decommissioning the Trading API surface (Finding & Shopping APIs gone in
  2025; multiple Trading fields/calls scheduled through 2026), but **has not shipped a REST
  replacement for buyer-seller messaging.** The Post-Order API (already used here for
  cases/returns/inquiries) does **not** cover pre-sale buyer questions.
- **Implication:** there is no "migrate to the new API" path for eBay pre-sale messaging. The
  realistic options are (a) keep using the Trading API as best-effort/optional and accept the
  platform risk, or (b) treat eBay messaging as out of scope and lead with the CardzCheck
  marketplace inbox (which reads our own DB and has no third-party risk). This reframes the
  decision from "rewrite the eBay integration" to "decide how much we want to depend on a
  no-successor legacy API."

Sources:
- [eBay API Deprecation Status](https://developer.ebay.com/develop/get-started/api-deprecation-status)
- [eBay Developers Program Q4 2025 Newsletter](https://developer.ebay.com/updates/newsletter/q4_2025)
- [GetMemberMessages reference](https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMemberMessages.html)
- [AddMemberMessageRTQ reference](https://developer.ebay.com/devzone/xml/docs/reference/ebay/AddMemberMessageRTQ.html)

---

## What's good (keep)

- `lib/messaging/types.ts` — clean, platform-agnostic domain model.
- `lib/messaging/adapters/cardzcheck.ts` — reads our own DB; no third-party risk. Solid.
- The AI reply-drafting in `lib/messaging/service.ts` (`generateAIReply`) — a genuinely useful,
  well-prompted seller-voice draft generator on Claude Haiku.
- The two-pane terminal UX shell in `components/business/messaging/`.

## What's holding it up (fix or cut)

| # | Issue | Location | Action |
|---|-------|----------|--------|
| 1 | eBay messaging on no-successor Trading API; raw token in XML; regex XML parsing | `lib/messaging/adapters/ebay.ts` | Flag-gate / quarantine |
| 2 | Auto-resolve/archive hides real threads on a 120-char preview regex; **client-side only, never persists** — false confidence | `lib/messaging/reply-drafts.ts` (`classifyThreadFromPreview`), `SalesAgentTerminal.tsx` (`autoResolvedMap`) | Remove |
| 3 | Eager draft pre-warm fires up to 5 Claude calls on every mount/refresh — silent spend | `SalesAgentTerminal.tsx:511-565` | On-demand only |
| 4 | "Agent" branding overpromises vs. actual behavior | UI labels, nav, route name | Rename to Inbox / Deal Desk |
| 5 | Debug logging in prod (raw XML dumps, token lookups, per-exchange logs) | `lib/messaging/adapters/ebay.ts`, `app/api/business/messages/route.ts` | Strip |
| 6 | Render-stability churn (infinite-loop/stale-counter history; eslint-disabled effects) | `SalesAgentTerminal.tsx` | Harden after 1–5 land |

---

## Open decision (needed before Phase 1)

**How much do we want to depend on eBay pre-sale messaging given there's no supported
successor API?**

- **Option A — eBay is core:** keep the Trading API path live, accept platform risk, invest in
  making it robust (proper XML parser, retry/backoff, monitoring for the day eBay restricts it).
- **Option B — eBay is best-effort:** ship CardzCheck messaging as the headline; keep eBay
  behind a feature flag, labeled "beta / may be interrupted," no eager spend on it.
- **Option C — eBay out of scope (for now):** hide the eBay tab entirely; revisit only if eBay
  ships a real messaging API or volume justifies the maintenance.

Recommendation: **Option B** for launch. Preserves the differentiator, removes it from the
critical path, and is reversible.

---

## Staged work

### Phase 0 — De-risk (no behavior the seller relies on) — ~0.5 day
- [ ] Remove auto-resolve/archive (#2): delete `classifyThreadFromPreview` usage and the
      `autoResolvedMap` / "Agent cleared" / activity-ticker wiring. Threads stop silently
      disappearing from the queue.
- [ ] Make drafts on-demand (#3): delete the pre-warm `useEffect`; generate a draft when a
      thread is opened (or on an explicit "Draft reply" click). Verify no Claude calls fire on
      mount.
- [ ] Strip debug logging (#5): remove `[ebay/debug]`, `[dbg:*]`, raw-XML and token-lookup logs.

### Phase 1 — eBay scoping (depends on Open Decision) — ~0.5–1 day
- [ ] Introduce a feature flag (e.g. `EBAY_MESSAGING_ENABLED`) gating the eBay platform tab and
      the eBay adapter calls in `loadThreadsForPlatform`.
- [ ] If Option B/C: default the flag off in prod; CardzCheck tab becomes the default platform.
- [ ] Empty/disabled states updated so a seller without eBay messaging sees a coherent inbox.

### Phase 2 — Honest framing — ~0.5 day
- [ ] Rename "Sales Agent" → "Inbox" (or "Deal Desk") across `Sidebar.tsx`, `SectionTabs.tsx`,
      route `app/business/sales-agent` (add a redirect from the old path), and in-component copy.
- [ ] Remove "Agent activity" / "Agent recommends" language; keep "Suggested reply" framing,
      which is accurate.

### Phase 3 — Stability hardening (only after 0–2) — ~1 day
- [ ] Audit `SalesAgentTerminal.tsx` effects; remove the `eslint-disable` escapes where the
      auto-resolve removal now allows clean dependency arrays.
- [ ] If Option A: replace regex XML parsing with a real parser and add retry/backoff +
      a monitored health signal for the Trading API path.

---

## Explicitly out of scope (for this revision)

- Server-side / autonomous automation (real "agent" behavior). Revisit only after the inbox is
  stable and we've decided eBay's role.
- Any eBay messaging rewrite that assumes a REST successor exists — it doesn't.

## Risks of doing nothing

- eBay can restrict `GetMemberMessages` / `AddMemberMessageRTQ` access at any time, breaking the
  eBay half of a launched, nav-linked feature with no fallback.
- Auto-resolve can hide a real, unanswered buyer (lost sale + bad seller trust) while showing
  "Agent cleared N."
- Per-mount AI pre-warm is uncapped spend that scales with page views, not intent.
