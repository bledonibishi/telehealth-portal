// Payment-method selection + payment, for the Checkout page built in Webflow.
//
// Targets markup already built in the Webflow Designer (see website/README.md):
//   [data-th-screen="checkout"|"nosession"]     shown/hidden based on whether a
//                                                lead + plan was picked on the quiz page
//   [data-th-method="paysera"|"stripe"]         payment method cards
//   [data-th-panel="paysera"|"stripe"]          the matching detail panel for each
//   [data-th-stripe-mount]                      Stripe Embedded Checkout mounts here
//   [data-th-paysera-methods]                   placeholder text (Paysera has no API yet)
//   [data-th-sum="name"|"desc"|"price"]         order summary fields
//   [data-th-pay]                               the pay/continue button
//   [data-th-pay-error]                         error text
//   [data-th-change]                            "change plan" link
//
// Reads the lead + selected plan from sessionStorage (set by quiz.js). Load after
// config.js. Requires config.stripePublishableKey and Stripe.js (loaded lazily,
// only if the customer picks the Stripe method) plus the Stripe Price IDs below.
(function () {
  // Stripe price IDs — this is a static file (no env vars at runtime), so these
  // are set here directly. Replace with the real IDs from your Stripe Dashboard.
  var PLANS = {
    HRT_STARTER: { name: 'HRT Starter', desc: 'Estradiol gel 0.1%', price: 49, stripePriceId: 'price_hrt_starter_placeholder', quizUrl: '/hrt-eligibility' },
    HRT_COMPLETE: { name: 'HRT Complete', desc: 'Estradiol gel + micronised progesterone', price: 79, stripePriceId: 'price_hrt_complete_placeholder', quizUrl: '/hrt-eligibility' },
    GLP1_STARTER: { name: 'GLP-1 Starter', desc: 'Semaglutide 0.25 mg → 0.5 mg titration', price: 149, stripePriceId: 'price_glp1_starter_placeholder', quizUrl: '/glp1-eligibility' },
    GLP1_ADVANCED: { name: 'GLP-1 Advanced', desc: 'Semaglutide 1 mg maintenance', price: 199, stripePriceId: 'price_glp1_advanced_placeholder', quizUrl: '/glp1-eligibility' },
  };

  function loadStripeJs(cb) {
    if (window.Stripe) return cb();
    var s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = cb;
    s.onerror = function () { cb(new Error('Could not load Stripe.')); };
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkoutScreen = document.querySelector('[data-th-screen="checkout"]');
    if (!checkoutScreen) return; // not the checkout page

    var config = window.TELEHEALTH_CONFIG || {};

    var session = null;
    try { session = JSON.parse(sessionStorage.getItem('th_lead') || 'null'); } catch (e) { /* ignore */ }
    var plan = session && session.planId ? PLANS[session.planId] : null;

    function showScreen(name) {
      document.querySelectorAll('[data-th-screen]').forEach(function (s) {
        s.style.display = s.getAttribute('data-th-screen') === name ? '' : 'none';
      });
    }

    if (!session || !plan) {
      showScreen('nosession');
      return;
    }
    showScreen('checkout');

    // Order summary
    var sumName = document.querySelector('[data-th-sum="name"]');
    var sumDesc = document.querySelector('[data-th-sum="desc"]');
    var sumPrice = document.querySelector('[data-th-sum="price"]');
    if (sumName) sumName.textContent = plan.name;
    if (sumDesc) sumDesc.textContent = plan.desc;
    if (sumPrice) sumPrice.textContent = '£' + plan.price;

    var changeLink = document.querySelector('[data-th-change]');
    if (changeLink) changeLink.setAttribute('href', plan.quizUrl);

    var payBtn = document.querySelector('[data-th-pay]');
    var payError = document.querySelector('[data-th-pay-error]');
    var stripeMount = document.querySelector('[data-th-stripe-mount]');
    var payseraMethods = document.querySelector('[data-th-paysera-methods]');

    var methodCards = document.querySelectorAll('[data-th-method]');
    var panels = document.querySelectorAll('[data-th-panel]');
    var activeMethod = null;
    var stripeCheckout = null; // the mounted Stripe Embedded Checkout instance

    function selectMethod(method) {
      activeMethod = method;
      methodCards.forEach(function (c) {
        c.classList.toggle('th-method-selected', c.getAttribute('data-th-method') === method);
      });
      panels.forEach(function (p) {
        p.style.display = p.getAttribute('data-th-panel') === method ? '' : 'none';
      });
      if (payError) payError.textContent = '';

      if (method === 'stripe') {
        if (payBtn) payBtn.style.display = 'none'; // Stripe's embedded form has its own pay button
        mountStripe();
      } else {
        if (payBtn) {
          payBtn.style.display = '';
          payBtn.textContent = 'Request a payment link';
        }
        if (payseraMethods) {
          payseraMethods.textContent = "We don't have automatic Paysera payments yet — confirm below and we'll email you a secure payment link within one business day.";
        }
      }
    }

    methodCards.forEach(function (card) {
      card.addEventListener('click', function () { selectMethod(card.getAttribute('data-th-method')); });
    });

    function mountStripe() {
      if (stripeCheckout || !stripeMount) return;
      if (!config.stripePublishableKey || !config.apiBase) {
        if (payError) payError.textContent = 'Card payment is not configured yet — please try Paysera, or contact us.';
        return;
      }
      stripeMount.innerHTML = '<p class="th-muted">Loading secure card form…</p>';

      fetch(config.apiBase + '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: plan.stripePriceId, planName: plan.name, customerEmail: session.email }),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.data.error || 'Could not start checkout.');
          return new Promise(function (resolve, reject) {
            loadStripeJs(function (err) {
              if (err) return reject(err);
              var stripe = window.Stripe(config.stripePublishableKey);
              stripe.initEmbeddedCheckout({ clientSecret: result.data.clientSecret }).then(function (checkout) {
                stripeCheckout = checkout;
                stripeMount.innerHTML = '';
                checkout.mount(stripeMount);
                resolve();
              });
            });
          });
        })
        .catch(function (err) {
          stripeMount.innerHTML = '';
          if (payError) payError.textContent = err.message || 'Something went wrong loading the payment form.';
        });
    }

    if (payBtn) {
      payBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (activeMethod !== 'paysera' || !config.graphqlUrl) return;

        payBtn.setAttribute('disabled', 'true');
        payBtn.textContent = 'Sending…';
        if (payError) payError.textContent = '';

        fetch(config.graphqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'mutation RequestManualInvoice($input: RequestManualInvoiceInput!) { requestManualInvoice(input: $input) { id } }',
            variables: { input: { leadId: session.id, planId: session.planId, planName: plan.name } },
          }),
        }).then(function (res) { return res.json(); }).then(function (json) {
          if (json.errors) throw new Error(json.errors[0].message);
          if (window.posthog) window.posthog.capture('manual_invoice_requested', { planId: session.planId });
          window.location.href = '/checkout-success';
        }).catch(function (err) {
          payBtn.removeAttribute('disabled');
          payBtn.textContent = 'Request a payment link';
          if (payError) payError.textContent = err.message || 'Something went wrong. Please try again.';
        });
      });
    }
  });
})();
