# The shop

Products sold on the website without a prescription (protein, supplements and the like), paid by card through
**Raiffeisen Bank (RaiAccept)** or **Stripe**. It is separate from the prescription flow: its own tables
(`shop_*`, `fiscal_receipts`), its own pages (`website/src/app/shop`), and the **Shop** page in the clinician portal.

## How a purchase works

1. The buyer fills the basket on `/shop` and checks out on `/shop/checkout`.
2. `POST /api/shop/orders` prices the basket from the database (the browser only sends products and quantities),
   takes the units off stock for 35 minutes, and opens the chosen provider's payment page.
3. The buyer pays on the provider's page. That page handles the card details and the 3-D Secure check (the SMS code or
   the bank app); they never reach our servers.
4. The provider sends the buyer back to `/shop/order/<reference>`, and notifies the backend. Neither counts as proof:
   the backend **asks the provider** about the payment and marks the order paid only when the amount, currency and
   reference match what it asked for.
5. Paid: the buyer gets an email, and a fiscal receipt is recorded as owed (**Shop → Fiscal receipts**).
6. Staff send it (**Mark as sent**, with courier and tracking), and can refund through the same provider.

**Paying on delivery or by bank transfer.** Pay on delivery confirms the order at once (status CONFIRMED; it
needs the buyer's phone). Staff send it, and press **Payment received** when the courier hands the money over. A
refused parcel is cancelled from the order, which puts its stock back. A bank-transfer order shows the buyer the
account details (also emailed) and holds its stock for `SHOP_TRANSFER_HOLD_DAYS`. Staff press **Payment received**
when the money arrives. Both record the fiscal receipt as owed at that moment, and refunds for them are paid back by
hand (the portal records them).

**The card form inside the checkout.** RaiAccept's form is shown in a frame on the checkout page (its "frameless"
mode). The card details and the bank's approval stay inside the bank's frame. Stripe's checkout can't be framed, so
it stays a redirect.

An order that isn't paid in time is cancelled by the `shop-orders` cron, which gives its stock back. If the buyer
still finishes paying afterwards, the payment is recorded and the order comes back as paid.

## Settings (backend)

| Variable | What it does |
|---|---|
| `RAIACCEPT_USERNAME`, `RAIACCEPT_PASSWORD` | API credentials made in the RaiAccept Merchant portal. Sandbox credentials send orders to the sandbox; production credentials to production (same addresses). |
| `RAIACCEPT_AUTH_URL`, `RAIACCEPT_API_URL` | Optional. Default `https://auth.raiaccept.com` and `https://trapi.raiaccept.com`. |
| `SHOP_PAYMENT_PROVIDERS` | Which ways of paying the shop offers. Default `RAIACCEPT,STRIPE`. Add `COD` (pay on delivery) and `BANK_TRANSFER`, e.g. `RAIACCEPT,COD,BANK_TRANSFER` (Stripe then stays for subscriptions only). |
| `SHOP_COD_MAX_CENTS` | Pay on delivery only up to this total, in cents (a refused parcel costs the delivery both ways). Default: no limit. |
| `SHOP_BANK_IBAN`, `SHOP_BANK_ACCOUNT_NAME`, `SHOP_BANK_NAME` | The account buyers pay into by bank transfer. Bank transfer is offered only once the IBAN and the account name are set. |
| `SHOP_TRANSFER_HOLD_DAYS` | How long a bank-transfer order holds its stock while the money arrives. Default `3`. |
| `STRIPE_SECRET_KEY` | Already used for subscriptions; the shop uses the same account. |
| `SHOP_SHIPPING_CENTS` | Delivery charge in cents. Default `0` (free). |
| `SHOP_FREE_SHIPPING_FROM_CENTS` | Free delivery from this subtotal, in cents. Default: no threshold. |
| `SHOP_COUNTRIES` | Countries delivered to (ISO codes, comma-separated). Default `XK`. |
| `API_PUBLIC_URL` | The backend's public address. RaiAccept is told to notify `<API_PUBLIC_URL>/api/shop/payments/raiaccept/notify`. |
| `WEBFLOW_SITE_URL` | The website's address; buyers come back to `<WEBFLOW_SITE_URL>/shop/order/<reference>`. |

With none of the providers set up (and not in production), the shop offers a **test payment** instead, whose page is
`/shop/test-payment`. No money moves.

## Setting up RaiAccept

1. In the Merchant portal, create **API credentials** (sandbox first) and set the two variables above.
2. Switch on Apple Pay and Google Pay there if wanted; they then appear on the payment page next to cards.
3. RaiAccept requires `https://` addresses for the return and notification URLs, so the sandbox can't be tried
   against `localhost`. Use a deployed preview, or a tunnel for both the website and the API.
4. RaiAccept's notifications are not signed. That is why the backend always reads the order back from the API.
   Their notifications come from `18.96.33.128/29`, if a firewall needs it.
5. Check in the sandbox: a paid order, a declined card, a refund, and a payment page left open past 35 minutes.
6. Still to confirm with RaiAccept: which country code they accept for Kosovo. It is left out for now; it is optional.

## Stripe

Shop payments use Stripe Checkout on the existing account. Completed sessions arrive on the existing webhook
(`/stripe/webhook`), which recognises them by `metadata.kind = shop` and hands them to the shop. No new webhook is
needed. Stripe can't onboard a business registered in Kosovo, so check the account's eligibility before relying on it.

## Fiscal receipts

Every paid order owes a sale receipt, and every refund a correcting one. Until the fiscal device or software is
connected, staff issue them there and enter the receipt number under **Shop → Fiscal receipts**. Connecting the fiscal
software later means creating the receipt where `FiscalReceipt` rows are written in `shop.service.ts`.
