# Courier tracking: three ways to connect a courier

| The courier… | What to use | What it takes |
|---|---|---|
| has no integration (e.g. a small local courier) | **Manual** | Nothing. The pharmacy presses *Ready for pickup* and *Mark shipped* (courier, tracking, expected dates). Our own team (admin) presses *Mark delivered* once the courier confirms. Orders past their expected date show under **Problems** so none are forgotten. |
| can send us updates | **Webhook** (below) | Give them this document and a secret. No code from us. |
| has a tracking API but can't call us | **Polling** | One small class (below). We ask for each parcel's status every 15 minutes. |

All three end in the same place (`OrdersService.applyTracking`), so the patient emails, the history, the audit trail and the
"never go backwards" rules are identical whichever is used, and a courier can be switched from manual to automatic
without touching anything else.

## Adding a courier with a tracking API (polling)

1. Write a class implementing `CourierTracker` (`src/couriers/courier-adapter.ts`):
   ```ts
   export class BekiTracker implements CourierTracker {
     readonly key = 'beki';
     handles(carrier: string) { return /beki/i.test(carrier); }          // matches the courier name on the order
     async fetch(trackingNumber: string): Promise<TrackingEventInput[]> {
       // call their API, then return one event per step, using our statuses (see the table below)
     }
   }
   ```
   Give each event a stable `externalId` if the courier has one; if not, one is made from the status and time.
2. List it in `couriers.module.ts`, in place of the empty `COURIER_TRACKERS` list.
3. That's all. Parcels whose courier name matches `handles()` and that have a tracking number are checked on a schedule.

Settings (all optional): `COURIER_POLLING=false` switches polling off; `COURIER_POLL_MINUTES` (default 15) is how often one parcel is asked about.
A parcel with no tracker for its courier is simply left for staff to update by hand.

---

# Courier tracking webhook


How a courier (or the company tracking parcels for them) tells us what happened to a parcel. Patients are emailed and
see the update on their order within seconds. Nothing here is specific to one courier: any courier that can send an
HTTP request can use it.

## Endpoint

```
POST https://<our-backend>/courier/webhook/<courier-name>
Content-Type: application/json
X-Courier-Signature: sha256=<hex>
```

- `<courier-name>` is a short word we agree, e.g. `beki`. Each courier has its own secret (`COURIER_WEBHOOK_SECRET_BEKI`);
  `COURIER_WEBHOOK_SECRET` is the fallback. Until a secret is set the endpoint answers `503`.
- The signature is the **HMAC-SHA256 of the exact request body**, keyed with the secret, in lowercase hex.
  A wrong or missing signature gets `401` and nothing is changed.

## Body

One event, or several: `{ "events": [ { … }, { … } ] }` (at most 100 per call).

| Field | Required | Meaning |
|---|---|---|
| `reference` | one of the two | Our parcel code, e.g. `TH-4KF8A2QX`: it is on the packing slip and the courier gives it back. (The full order id also works.) |
| `trackingNumber` | one of the two | The courier's tracking number, if we have recorded it on the order. |
| `status` | yes | What happened — see below. |
| `occurredAt` | no | ISO time it happened. Defaults to the time we receive it. |
| `eventId` | recommended | The courier's own id for this event. Sending the same id twice is recorded once. |
| `location` | no | Depot or town. |
| `note` | no | Free text, e.g. "Recipient not at home". |
| `carrier` | no | Name to show the patient. |
| `trackingUrl` | no | Public tracking page (`http://` or `https://`). Shown to the patient. |
| `estimatedDeliveryFrom` / `estimatedDeliveryTo` | no | The expected delivery window, ISO dates. Shown to the patient. |

### Statuses

| `status` | Use it when | Effect on the order |
|---|---|---|
| `picked_up` | The courier collected the parcel | Shipped; patient emailed |
| `in_transit` | It is moving between depots | History only (and shipped, if we hadn't heard of the pickup) |
| `out_for_delivery` | It is with the driver today | Out for delivery; patient emailed |
| `delivered` | It was handed over | Delivered; patient emailed |
| `delivery_failed` | An attempt did not succeed | History; patient emailed; flagged to staff |
| `returned` | It is going back to the pharmacy | History; flagged to staff |
| `exception` | Damaged, lost, delayed, held… | History; flagged to staff |
| `ready_for_pickup` | The parcel is ready to be collected | History |

Upper or lower case, with spaces, dashes or underscores, all work (`Out for delivery`, `out-for-delivery`). Common
alternatives are understood too (`collected`, `failed`, `returned to sender`, …). Anything else is rejected with `400`
and the list of valid values.

## What we do with it

- **Forward only.** An order never goes back a step, so a late or repeated event can't undo a delivery. It still goes in the history.
- **Missed steps are filled in.** A `delivered` with no earlier `picked_up` marks the order delivered with that time on every step.
- **Safe to resend.** Events with the same `eventId` for the same order are recorded once.
- **Unknown parcels are ignored,** not an error: the reply counts them.
- Cancelled orders are ignored.

## Reply

`200` with how many events were used:

```json
{ "applied": 1, "duplicates": 0, "ignored": 0 }
```

Errors: `400` (can't read the body), `401` (bad signature), `404` (name isn't a plain word), `503` (no secret set up yet).
Retry on `5xx` or a timeout; resending is safe.

## Try it

```sh
SECRET='the-shared-secret'
BODY='{"reference":"<order id>","status":"picked_up","eventId":"test-1","carrier":"Posta BEKI","trackingNumber":"BK123"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST http://localhost:4000/courier/webhook/beki \
  -H 'Content-Type: application/json' \
  -H "X-Courier-Signature: sha256=$SIG" \
  -d "$BODY"
```

## Services with their own format

AfterShip, EasyPost, DHL and similar send their own payloads. Each gets a small adapter in `src/couriers/`
(how to verify the call, how to read its events) listed in `couriers.service.ts`; everything after that is shared.
