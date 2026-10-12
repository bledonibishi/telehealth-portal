# Device weight API

How a smart scale, or the mobile app relaying Apple Health / Google Fit, sends weights.

## 1. The patient allows a device (signed in, GraphQL)

```graphql
mutation { createDeviceConnection(input: { provider: SMART_SCALE, label: "Bathroom scale" }) { id token tokenHint } }
```

`token` (starts with `thd_`) is shown **once**; only its hash is stored. `myDeviceConnections` lists connections,
`revokeDeviceConnection(id)` stops a token working at once (weights it already sent are kept). Up to 5 active per patient.

## 2. The device sends weights

```
POST /integrations/weights
Authorization: Bearer thd_…
Content-Type: application/json

{ "readings": [
  { "externalId": "scale-8841-2026-10-04T07:02:11Z", "weight": 94.6, "unit": "kg", "measuredAt": "2026-10-04T07:02:11Z" }
] }
```

| field | rule |
|---|---|
| `externalId` | the device's own id for the reading, 1–100 characters. Sending it again records nothing new, so retries and re-syncs are safe |
| `weight` | a number; `unit` is `"kg"` (default) or `"lb"`. 30–300 kg |
| `measuredAt` | ISO 8601; not in the future, not more than 5 years ago |

At most 100 readings per request and 500 per connection per day. Each reading is checked on its own:

```json
{ "accepted": 1, "duplicates": 0, "rejected": [] }
```

`rejected` lists `{ index, externalId?, reason }` for the ones that were not saved. Errors: `401` for a missing, unknown or
revoked token; `403` when the patient's programme has no weight tracking; `400` for a malformed body.

Readings are stored as weight entries with source `DEVICE`, so they appear in the patient's chart and history like any
other weighing; the patient can remove one they don't want, and doctors can correct or void it as usual.

A device token can only write weights for the patient who created it. It is not a login token and opens nothing else.
