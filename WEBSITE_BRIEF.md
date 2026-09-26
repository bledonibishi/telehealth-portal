# Website Builder Brief

We are building a telehealth platform that sells two categories of prescription products in Kosovo: **HRT (hormone replacement therapy)** and **GLP-1 weight-loss injections** (Wegovy/Ozempic). The backend is already built (NestJS + GraphQL + PostgreSQL). Your job is to design and implement the **public-facing marketing website** in Webflow, with custom scripts connecting it to our backend.

---

## User journey

1. **Landing page** — explains the two product categories (HRT and GLP-1). Each has a CTA button: "Check if you're eligible."

2. **Eligibility quiz** — when the user clicks a CTA, they enter a multi-step quiz specific to that product. Each question is single or multi-select. If the user picks a disqualifying answer, they are shown an ineligible screen. If they pass all questions, they proceed.

3. **Plan selection** — the user sees 2 plan cards for whichever product they chose. Clicking a plan sends them to Stripe Checkout.

4. **Stripe payment** — we have a `/api/checkout` POST endpoint already built. You call it with `{ priceId, planName }` and it returns `{ url }` to redirect the user to Stripe. After payment:
   - `/checkout/success` — thank you screen, tells the user to check their email
   - `/checkout/cancel` — sends them back

5. **Lead creation** — when a user completes the quiz, we save them as a Lead via GraphQL mutation:

```graphql
mutation CreateLead($input: CreateLeadInput!) {
  createLead(input: $input) {
    id
  }
}
```

Input fields: `email`, `firstName`, `lastName`, `productKind` (HRT or GLP1), `quizAnswers` (array of `{ questionId, question, answer }`), `stripeSessionId` (optional).

GraphQL endpoint: `POST http://[backend-url]/graphql`

---

## Quiz questions

### HRT quiz (5 questions)

1. **Age** — disqualifies if under 18 or over 65
2. **Symptoms** (multi-select, must pick at least one) — hot flushes, mood changes, brain fog, low libido, sleep disturbances, joint pain. "None of the above" disqualifies.
3. **Medical history** (multi-select) — breast cancer, blood clots (DVT/PE), stroke/heart attack in past 12 months, unexplained vaginal bleeding each disqualify. "None of the above" passes.
4. **Pregnancy** — "Yes" disqualifies
5. **Uncontrolled high blood pressure (>160/100)** — "Yes" disqualifies

### GLP-1 quiz (5 questions)

1. **Age** — disqualifies if under 18 or over 75
2. **BMI** — disqualifies if under 27. Passes if 30+ or 27–29 with a weight-related condition (diabetes, high blood pressure). "I don't know" allowed but must eventually confirm.
3. **Medical history** (multi-select) — Type 1 diabetes, medullary thyroid carcinoma / MEN2 syndrome, pancreatitis each disqualify. "None of the above" passes.
4. **Pregnancy / breastfeeding / planning pregnancy in next 6 months** — "Yes" disqualifies
5. **Severe GI disorders** (gastroparesis, IBD) — "Yes" disqualifies

---

## Plans and pricing

| Plan | Product | Price | Stripe Price ID env var |
|------|---------|-------|------------------------|
| HRT Starter | Estradiol gel 0.1% | £49/mo | `STRIPE_PRICE_HRT_STARTER` |
| HRT Complete | Estradiol gel + micronised progesterone | £79/mo | `STRIPE_PRICE_HRT_COMPLETE` |
| GLP-1 Starter | Semaglutide 0.25→0.5 mg titration | £149/mo | `STRIPE_PRICE_GLP1_STARTER` |
| GLP-1 Advanced | Semaglutide 1 mg maintenance | £199/mo | `STRIPE_PRICE_GLP1_ADVANCED` |

---

## Implementation approach (Webflow + custom code)

Design lives in Webflow. Logic (quiz state, API calls, Stripe redirect) is implemented as custom `<script>` tags in Webflow's custom code embed. No framework needed — vanilla JS is fine.

Key integration points:
- `POST /api/checkout` with `{ priceId, planName }` → get `{ url }` → `window.location.href = url`
- GraphQL mutation to backend with lead data after quiz completion
- Quiz state tracked in a JS object as the user moves through steps

---

## Tone and brand

- Clean, medical but approachable — not cold or clinical
- Trust signals: licensed doctors, registered medications, secure data
- Two clear product paths: **HRT** (women 40–65) and **GLP-1** (BMI 27+)
