# TMS KM Mobile

The driver app for the TMS (transport management system). It is a small subset of the full product: it shows a driver the trips assigned to them and lets them run a trip from the phone. It never plans, assigns vehicles, approves changes or edits master data; when a driver needs something like that, the app sends a request to the office.

Built with Expo (SDK 58), React Native, TypeScript, Expo Router and TanStack Query. Android first; nothing is Android-only by design.

## What works in this version

- Company code -> tenant -> email and password sign-in. The token is opaque, lasts 12 hours and is kept in secure storage. It is renewed with `POST /mobile/auth/refresh` while it still works (inside its last two hours, on coming back to the app, and every ten minutes). The backend revokes the old token at once, so a 401 only ends the session when it belongs to the token the app holds now; a request sent with the old token a moment before a refresh does not sign the driver out. An expired token cannot be renewed: the driver signs in again, and queued work waits and is sent after that.
- Trip list from `GET /mobile/me/sync` (pull to refresh, refresh on app foreground and every minute, offline banner).
- Trip detail: accept or reject a trip, start, complete (blocked until every stop has proof of delivery).
- Stop screen: ordered stops, arrival status from the GPS geofence, check-in (with a manual override and reason), check-out, hand-off to Google Maps.
- Proof of delivery: recipient, notes, photo upload with a stable `clientDocumentId`.
- Driver requests: report a problem, leave a note, ask to take goods off (the planner decides).
- Foreground GPS tracking while a trip is on the road, sent in batches of up to 100.
- Thai and English, a Buddhist-era or Christian-era date setting, and a settings tab.

- **Works without a signal.** Every step the driver takes (accept, start, check in, proof of delivery with photo, check out, complete, problems, notes) is saved on the phone first and sent when the connection returns. See "Offline" below.

- Live updates: a SignalR connection to `/hubs/tracking` (derived from the API address, or `EXPO_PUBLIC_HUB_URL`) while the app is in front. `TripUpdated` and a reconnect only make the app read `/me/sync` and the trips again; nothing in an event is trusted as data, because the backend keeps events in memory and never replays what a phone missed offline.

Not built yet: background location, push notifications (FCM), signature capture, barcode scanning, iOS testing. See the roadmap below.

## Run it

```bash
npm install
npx expo start
```

The API address is read from `EXPO_PUBLIC_API_BASE_URL`. The default is `http://10.0.2.2:5100/api`, which is the host computer as seen from the Android emulator. For a real phone, put your computer's address in a `.env` file:

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:5100/api
```

Native modules used here (location, camera) need a development build rather than Expo Go on some platforms: `npx expo run:android`, or `eas build --profile development`.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests in `test/` (Jest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |

## Project layout

```
app/                  Expo Router screens (every file is a route)
  company.tsx, login.tsx          sign-in flow
  (app)/(tabs)/                   main pages with bottom navigation: home, settings
  (app)/trips/[tripId]/           trip, stop, proof of delivery, problem or note
src/
  offline/    snapshot and outbox: engine (sender), SQLite store, manager, repo
  api/        client.ts is the only place that builds headers; mobile.ts (sign-in), trips.ts (driver calls)
  auth/       session and secure storage
  domain/     pure trip rules (stop order, allowed actions, completion guard)
  hooks/      data and action hooks
  location/   foreground GPS tracking
  settings/   language and date era
  i18n.ts     Thai and English strings
  dates.ts    one date formatter that takes the era as a parameter
test/         unit tests (*.test.ts)
```

## Offline

Two parts, no general sync engine (`src/offline/`):

- **Snapshot.** Every good answer from the server (the trip list and each trip) is saved in SQLite. When the network fails or the server errors, the app shows the saved copy and says so. Trips are saved when the list loads, so they open offline.
- **Outbox.** A driver action becomes a command row in SQLite. The screen shows the server's copy of the trip with the waiting commands applied on top (`src/domain/commands.ts`), so the next stop opens and the buttons update without a signal. The server's copy is never overwritten by a guess.

The sender (`src/offline/engine.ts`) runs when a row is made, when the connection returns, when the app comes to the front, and every 30 seconds:

- One `Idempotency-Key` per row, made with the row and reused on every retry.
- The `If-Match` version is never stored. It is read from the latest server copy when a row is sent, and each response replaces that copy before the next row.
- Per trip, one command at a time, in order. A row the server refuses is marked failed with the reason and blocks the rows behind it until the driver retries or discards it (Settings > Unsent work). Other trips are not blocked.
- A 412 is not a failure yet: the trip is re-read, and if it already shows the step (a lost answer to check-in or check-out, which have no idempotency key) the row counts as done.
- A time-out keeps the row and stops the run; sending waits with a backoff. A 401 stops everything and keeps every row; after the same driver signs in again, sending resumes.
- GPS samples are written to SQLite and sent first, in batches of up to 100, so the server can judge a later check-in by where the vehicle was.
- The app branches on the server's stable `code` (Problem Details), never on the English text. `VERSION_CONFLICT`, `STOP_ALREADY_ARRIVED` and `POD_ALREADY_CAPTURED` make it re-read the trip and look; the other codes are shown to the driver in Thai or English (see `code_*` in `src/i18n.ts`).
- A GPS batch is split only on a 400 with `INVALID_REQUEST`, until the one bad point stands alone and only it is dropped. Any other refusal (403, 404, 409, 412, 422, or a 400 without that code) is about the trip, not a point: nothing is deleted, and the trip is held back with a growing wait (30 s doubling to 1 h). Samples older than 3 days are discarded so a trip that never accepts them cannot fill the phone. A 429 or 5xx is retried later.
- A check-in the server refuses with `GEOFENCE_REQUIRED` (the vehicle was not at the stop) cannot succeed as it is, so the Unsent work screen offers "Check in manually": the same command, with the time it was pressed, is sent again as a manual check-in with the driver's reason.
- A phone that ran an earlier build may hold outbox rows with the same order number. On opening, the numbers are made distinct (keeping the order) before the unique index is built, so the database still opens.
- A proof photo is copied into the app's documents folder and uploaded as its own row with a stable `clientDocumentId`; it does not hold up the check-out.
- Event times (`occurredAt`) are taken on the phone when the button is pressed.
- Check-in offline uses the phone's own position against the backend's 200 m rule; the server still decides when the command arrives.
- Another driver's rows are never sent under this driver's name; they are offered for discard. Their saved trips are cleared when a different driver signs in.

Known limits: problem reports and notes have no idempotency key on the backend, so a lost answer followed by a retry can send one twice. Tokens are never stored in SQLite (secure storage only).

## Rules the app follows

- It calls `/api/mobile/*` only, never the back-office routes.
- Every change sends the item's `version` as `If-Match`. Start, complete and proof of delivery also send one `Idempotency-Key` per user action, reused on retries. A time-out is treated as an unknown outcome, not a failure.
- Check-in and check-out have no idempotency key, so a 412 triggers a re-read of the trip instead of a silent retry.
- Event times are taken on the device when the button is pressed and sent as UTC.
- Backend error text is English and is mapped to Thai or English messages rather than shown raw.

## Roadmap

1. Background location (GPS samples are already stored durably).
2. Barcode scanning, once its contract is decided.
3. Full-loop test against the real backend (company, sign-in, sync, offline, check-in, proof, complete), then background location for an active trip on a development build and a real device.
4. Push notifications and hardening.
5. iOS.
