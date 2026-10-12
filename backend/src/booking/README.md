# Booking

Scheduling for the whole product, in one place. Patients pick a time in Cal.com's scheduler; this module
keeps a record of every booking, ties it to the patient and to whatever it is for, and tells the part of
the app that owns it when it changes. Nothing else in the codebase talks to Cal.com.

```
 app screen ──▶ bookingSession(purpose, referenceId) ──▶ { calLink, name, email, signed token }
     │
     ▼
 <BookingScheduler>  (packages/booking, wraps @calcom/embed-react)  ──▶ Cal.com
                                                                          │ signed webhook
                                                                          ▼
 POST /booking/webhooks/calcom ──▶ BookingService.applyProviderEvent ──▶ bookings table
                                                                          │
                                                                          ▼
                                                           purpose.onChange(booking)   e.g. appointments
```

## Using it somewhere new

**1. Register a purpose** in the module that owns the thing being booked:

```ts
@Module({ imports: [BookingModule], … })

onModuleInit() {
  this.bookings.register({
    key: 'LAB_REVIEW',                       // UPPER_SNAKE_CASE
    label: 'A call about your blood results', // what the patient sees
    requiresReference: true,                  // must be booked for a specific lab result
    authorize: async (patientId, labResultId) => { /* throw unless it is theirs */ },
    onChange: async (booking) => { /* booking.status: CONFIRMED | CANCELLED | COMPLETED … */ },
  });
}
```

**2. Point it at a Cal.com event type**: `CALCOM_EVENT_LAB_REVIEW=clinic/lab-review`
(or let it use `CALCOM_EVENT_DEFAULT`).

**3. Show the scheduler** (patient portal):

```tsx
import { BookingCard } from '@/components/booking/BookingCard';
<BookingCard purpose="LAB_REVIEW" referenceId={labResult.id} fallback={<OldFlow />} />
```

`BookingCard` is the portal's styled wrapper, and `<BookedAppointments />` lists everything the patient has
booked with move and cancel. In another app, use the pieces directly from `@telehealth/booking`:
`useBooking(purpose, referenceId)`, `useMyBookings()`, `useReschedule()` and `<BookingScheduler session={…} />`.

A purpose with no reference (`GENERAL`, "a call with your care team") is built in.

## What it guarantees

- **Webhooks are the fast path, not the only one.** Whenever a patient's bookings are read (`myBookings`,
  `bookingSession`), they are first reconciled with Cal.com's API (at most every 5 seconds per patient). A
  missed webhook — an outage, a deploy, a laptop Cal.com can't reach — is caught the next time anyone looks.
- **What a booking is *for* is only believed from our signature.** The scheduler runs in the browser, so the
  patient id, purpose and reference travel as an HMAC-signed token in the booking's metadata (judged against
  when the booking was made). A booking without a token can still be the patient's own when Cal.com lists it
  under their verified email — it shows in their appointments and they can move or cancel it — but it is
  never tied to a reference. Bookings under no known email stay `UNLINKED` (staff see them in the diary).
- **Webhooks are verified** (`x-cal-signature-256`, HMAC-SHA256 of the raw body) and refused without a secret.
- **Duplicates and out-of-order messages are safe**: bookings are keyed by Cal.com's uid, and a message older
  than the last one applied is dropped.
- **A reschedule** is a new uid at Cal.com: the old row becomes `RESCHEDULED` and the new one inherits the
  patient, purpose and reference. Patients move a booking through `rescheduleSession(uid)`, which opens the
  scheduler on the event it was booked on.
- **No medical details leave the system**: Cal.com gets the patient's name, email and the token.
- **Not configured = not offered**: `bookingSession` returns null, and callers show what they showed before.

## Cal.com setup

1. Create the event types (e.g. "Routine appointment" 15 min, "Urgent appointment" with only near-term slots).
2. Settings → Developer → API keys → create one → `CALCOM_API_KEY`.
3. Settings → Developer → Webhooks → new webhook to `<API>/booking/webhooks/calcom`, with a secret
   (`CALCOM_WEBHOOK_SECRET`) and triggers: Booking created, rescheduled, cancelled, requested, rejected,
   Meeting ended.
4. Hosts should use the same email in Cal.com as their clinician account, so bookings show under their name.
