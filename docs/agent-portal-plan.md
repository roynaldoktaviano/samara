# Agent Portal Plan

Planned feature: an "Agent Portal" for travel partners/press, modeled after a reference
YMA Yachting-style "Travel Partner & Press Toolkit" page. Two modules:

- **Resource Library** — browse/download marketing materials (brochures, itineraries,
  deck plans, photos, etc.), optionally organized/filtered by yacht.
- **Yacht Availability** — read-only shared calendar showing yacht schedules/availability,
  derived from existing `Yacht`/`Booking` data. Must NOT leak guest/customer PII — just
  booked-vs-available dates.

## Architecture (decided, not yet implemented)

- **Single Next.js app/deployment** — not a separate app calling this ERP via a remote
  API. No specific reason to isolate further at this scale, so keeping it simple.
- Served on a **new subdomain** (name not yet chosen) pointing at the same server/process
  as `erp.samarayachting.com`. `src/middleware.ts` will need to check the `host` header
  and rewrite requests on that subdomain to a new `/agent-portal/*` route tree (mirrors
  the existing `/request-order` standalone-public-page pattern, but this one requires
  login since it's per-agent).
- Reuses the same database — new data needed is additive only: likely a new
  `AgentResource` model (category, title, file, optional `yachtId` FK) for the Resource
  Library, plus new nullable auth fields on the existing `Agent` model.
- **Auth: email + password per agent** (not magic link, not a shared access code) — each
  `Agent` gets their own login credentials. Needs password fields on `Agent` (or a related
  auth table) and a dedicated login flow separate from the internal NextAuth `User`/`Role`
  system (agents are not staff `User` accounts).
- Nginx: needs a new server block for the new subdomain proxying to the same Next.js
  process, plus a DNS record.

## Not yet decided / needed before implementation starts

- The actual subdomain name.
- Exact Resource Library file categories/taxonomy.
- Whether Yacht Availability reuses an existing internal API (filtered) or needs a
  dedicated public-safe endpoint.

## Status

Plan only — not yet built. Pick this up by providing the subdomain name.
