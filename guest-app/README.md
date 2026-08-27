# Cooklyt — guest dine-in app

The customer-facing surface of the Cooklyt platform for **Amber & Vine**, a
modern Indian restaurant. Guests check in from their table, say who's eating,
set preferences (or share a link so everyone answers on their own phone), and
get dish recommendations the whole table will agree on — then order straight to
the kitchen, watch it being made, and settle at the table.

Built with [Next.js](https://nextjs.org) (App Router), React 19, Tailwind CSS 4,
and Framer Motion.

**Wired to the operator backend.** This app fetches its live menu, prices,
recommendations, and order intake from the POS backend over `/api/guest/*`
(the [`backend/`](../backend) app in this monorepo, module `backend/src/guest/`).
It degrades gracefully: when the backend is unreachable it falls back to the
bundled menu and behaves like the standalone prototype — and it never fabricates
an order number or a bill.

## Getting started

```bash
npm install
npm run dev -- -p 3001          # runs on http://localhost:3001
```

Point it at the backend and outlet with a `.env.local` (see
[`.env.example`](.env.example)):

```bash
NEXT_PUBLIC_COOKLYT_API=http://localhost:3000   # the ops app
NEXT_PUBLIC_COOKLYT_OUTLET=<outlet-id>          # which restaurant this QR serves
```

Run the ops app on port 3000 first so the live menu and order intake work. With
the backend down, the app still runs on the bundled fallback menu.

### Demo walkthrough

The menu, orders, kitchen status, and bill are **real** against the backend.
**Phone identity is not.** There is no OTP send/verify endpoint anywhere, and
reservation lookup matches a static client-side fixture (`data/`), not the
backend — so guest identity is presentational end to end today. This matters
beyond the demo: phone is the primary key for guest CRM, repeat-visit rate and
winback, so every one of those numbers is only as trustworthy as the phone
number behind it.

Wiring it is a P0 for launch. Note that delivering OTP over WhatsApp avoids
India's DLT registration entirely (DLT governs SMS).

1. **I have a reservation** → demo booking **Priya Sharma · 98765 43210** (party
   size comes from the booking). Any other number shows "Reservation not found."
2. **OTP** → not implemented: any 6 digits are accepted.
3. **Who's at the table** → add guests yourself or share the table code / QR;
   demo guests join on their own after a moment.
4. **Preferences** → diets (multi-select with headcounts), your own allergies,
   and the table's mood — or switch to per-person entry.
5. **Picks → Order** → add dishes, leave a kitchen note, place the order. The
   order is priced and recorded by the backend.
6. **Order's in** → a live status stepper polls the kitchen
   (received → preparing → ready → served).
7. **Pay at the table** → record how you're paying (cash / card / UPI). This is
   a settlement record — no charge is made in the app.

## Project layout

```
app/            One route per screen (reservation, verify, members,
                preferences, recommendations, order, success, pay, feedback…)
                + global-error boundary
components/     Shell, action bar, and UI primitives (button, card, chip, toast…)
features/       Composite pieces (recommendation card, allergy banner, avatars)
hooks/          use-flow (session state), use-guard (route guards),
                use-menu (live menu from the backend, offline fallback)
lib/            backend.ts (the ops API bridge), menu-source.ts, the
                recommendation engine, allergy mapping, analytics, observability
data/           Bundled fallback menu + mock bookings/guests
types/          Shared TypeScript types
```

Session state lives in `sessionStorage` under `cooklyt-session` — refresh keeps your place; "Start a new table" on the thanks screen resets it.

## Scripts

| Command         | What it does               |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint                 |
| `npm run typecheck` | `tsc --noEmit`         |

## Quality gate

`npm run lint` and `npm run typecheck` are the compile-and-lint gate for this
app. There is no test suite here — the recommender logic it shares with the
backend is covered on the backend side (`backend/src/modules/`), which is the
correctness gate.
