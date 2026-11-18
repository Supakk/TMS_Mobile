# TMS KM Mobile

The driver app for the TMS (transport management system). It is a small subset of the full product: it shows a driver the trips assigned to them and lets them run a trip from the phone. It never plans, assigns vehicles, approves changes or edits master data; when a driver needs something like that, the app sends a request to the office.

Built with Expo (SDK 58), React Native, TypeScript, Expo Router and TanStack Query. Android first; nothing is Android-only by design.

## What works in this version

- Company code -> tenant -> email and password sign-in. The token is opaque, has an expiry and is kept in secure storage. There is no refresh: on expiry or any 401 the session is cleared.
- Trip list from `GET /mobile/me/sync` (pull to refresh, refresh on app foreground and every minute, offline banner).
- Trip detail: accept or reject a trip, start, complete (blocked until every stop has proof of delivery).
- Stop screen: ordered stops, arrival status from the GPS geofence, check-in (with a manual override and reason), check-out, hand-off to Google Maps.
- Proof of delivery: recipient, notes, photo upload with a stable `clientDocumentId`.
- Driver requests: report a problem, leave a note, ask to take goods off (the planner decides).
- Foreground GPS tracking while a trip is on the road, sent in batches of up to 100.
- Thai and English, a Buddhist-era or Christian-era date setting, and a settings tab.

Not built yet: the offline outbox and local snapshot, background location, SignalR live updates, push notifications (FCM), signature capture, iOS testing. See the roadmap below.

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

## Rules the app follows

- It calls `/api/mobile/*` only, never the back-office routes.
- Every change sends the item's `version` as `If-Match`. Start, complete and proof of delivery also send one `Idempotency-Key` per user action, reused on retries. A time-out is treated as an unknown outcome, not a failure.
- Check-in and check-out have no idempotency key, so a 412 triggers a re-read of the trip instead of a silent retry.
- Event times are taken on the device when the button is pressed and sent as UTC.
- Backend error text is English and is mapped to Thai or English messages rather than shown raw.

## Roadmap

1. Local snapshot and sequential outbox (one command at a time per trip, in order) with an offline indicator.
2. Durable GPS queue and background location.
3. SignalR (`/hubs/tracking`) with `/me/sync` as the fallback.
4. Push notifications and hardening.
5. iOS.
