# Testing the prescription proof reader

The reader (`src/onboarding/proof-reader.service.ts`) reads a photo of a pharmacy label, prescription or order
confirmation. A clinician relies on what it reads to decide a dose, so before changing its prompt or model, measure it
on documents with known answers. Change one thing at a time and compare scores.

## 1. Get documents with answers

Synthetic (made-up patients, no real data, 44 documents, the same every time):

    cd backend
    pnpm make-proof-test-set          # writes eval/proof-reader/synthetic/

It covers the three document types, all three medicines and their strengths, five date styles (including day/month
both 12 or under, where a US-style reader gets it wrong), tilted, dim, soft and heavily compressed photos, and hard
cases: an old dose printed next to the current one, two dates, text in the image that tries to give the model orders,
a dose pasted over in another font, a landscape photo, and a document blurred past reading.

These are cleaner than real photos, so scores are optimistic. Add your own to `eval/proof-reader/private/` (photos of
your own packaging, a test prescription): any image with an `<image>.expected.json` next to it is scored. That folder
is git-ignored; never put a real patient's document in the repo.

An answer key looks like this (see any file in `synthetic/`). `null` means "nothing to read here", and a value read
where the key says null counts as invented. `readable: null` leaves that field unscored.

    { "readable": true, "isPrescriptionEvidence": true, "patientName": "Zoë Müller", "molecule": "tirzepatide",
      "doseMg": 5, "documentDate": "2026-09-03", "dateKind": "dispensed", "flagsConcerns": false }

## 2. Score

    pnpm compare-proof-models eval/proof-reader/synthetic                       # the default three models
    pnpm compare-proof-models eval/proof-reader/synthetic claude-haiku-4-5      # one model

Every image × model is a real, billed call (roughly 1–2 cents each on Sonnet; the full set on three models is a few
dollars). Use `ANTHROPIC_API_KEY` from the environment, or the script falls back to `backend/.env`.

For each model you get, per field, how many were **ok**, **left** to a clinician (nothing read, or a false alarm), or
**wrong** (a confident error). Wrong is the number to push to zero, above all for dose and date. A read that failed
outright counts as left, so check the "reads failed" column is 0 before trusting a score.

## 3. Improve

Run it, change the prompt (`SYSTEM` in the reader) or model, run again, and keep the change only if wrong goes down
without left going up a lot. Examples in a prompt cost tokens on every document, so add them for the cases that fail.
