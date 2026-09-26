// Plan selection + Stripe Checkout. Mounts into a single container element on the Webflow plans page.
//
// Usage in Webflow:
//   <div id="th-plans-app" data-product="hrt"></div>  (or "glp1" — falls back to ?product= query param)
// Load after config.js. Stripe price IDs are read from data-* attributes below —
// replace the placeholder values with your real Stripe Price IDs (or wire them up
// however you prefer; nothing here depends on env vars since this is a static script).
(function () {
  var PLANS = {
    hrt: [
      {
        id: 'hrt-starter', name: 'HRT Starter',
        tagline: 'Estradiol gel — the most prescribed starting point for menopause relief',
        price: 49, interval: 'month',
        features: ['Estradiol gel (0.1%)', '3-month supply on first order', 'Monthly prescription review', 'Secure messaging with your clinician', 'Free UK delivery'],
        stripePriceId: 'price_hrt_starter_placeholder',
      },
      {
        id: 'hrt-complete', name: 'HRT Complete',
        tagline: 'Combined oestrogen + progesterone — recommended if you have a uterus',
        price: 79, interval: 'month', popular: true,
        features: ['Estradiol gel + micronised progesterone', '3-month supply on first order', 'Monthly prescription review', 'Priority clinician access', 'Secure messaging', 'Free UK delivery'],
        stripePriceId: 'price_hrt_complete_placeholder',
      },
    ],
    glp1: [
      {
        id: 'glp1-starter', name: 'GLP-1 Starter',
        tagline: 'Semaglutide at a starting dose — safe, gradual titration over 12 weeks',
        price: 149, interval: 'month',
        features: ['Semaglutide 0.25 mg → 0.5 mg titration', 'Weekly self-injection pen', 'Monthly clinical review', 'Dietitian-led nutrition guidance', 'Free UK delivery'],
        stripePriceId: 'price_glp1_starter_placeholder',
      },
      {
        id: 'glp1-advanced', name: 'GLP-1 Advanced',
        tagline: 'Semaglutide 1 mg — full maintenance dose for continued results',
        price: 199, interval: 'month', popular: true,
        features: ['Semaglutide 1 mg weekly', 'Monthly clinical review', 'Personalised meal plan', 'Priority clinician & dietitian access', 'Progress tracking dashboard', 'Free UK delivery'],
        stripePriceId: 'price_glp1_advanced_placeholder',
      },
    ],
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function renderPlanCard(plan) {
    var card = el('div', { class: 'th-plan-card' + (plan.popular ? ' th-plan-card-popular' : '') });
    if (plan.popular) card.appendChild(el('span', { class: 'th-plan-badge', html: 'Most popular' }));

    card.appendChild(el('h3', { class: 'th-plan-name', html: plan.name }));
    card.appendChild(el('p', { class: 'th-plan-tagline', html: plan.tagline }));
    card.appendChild(el('div', { class: 'th-plan-price', html: '£' + plan.price + ' <span class="th-plan-interval">/ ' + plan.interval + '</span>' }));

    var list = el('ul', { class: 'th-plan-features' });
    plan.features.forEach(function (f) { list.appendChild(el('li', { html: f })); });
    card.appendChild(list);

    var errorMsg = el('p', { class: 'th-plan-error' });
    card.appendChild(errorMsg);

    var button = el('button', { type: 'button', class: 'th-plan-select', html: 'Select plan →' });
    button.addEventListener('click', function () {
      button.setAttribute('disabled', 'true');
      button.innerHTML = 'Redirecting…';
      errorMsg.innerHTML = '';

      var config = window.TELEHEALTH_CONFIG;
      fetch(config.apiBase + '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: plan.stripePriceId, planName: plan.name }),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.data.error || 'Something went wrong.');
          if (window.posthog) posthog.capture('plan_selected', { planId: plan.id, planName: plan.name });
          location.href = result.data.url;
        })
        .catch(function (err) {
          errorMsg.innerHTML = err.message;
          button.removeAttribute('disabled');
          button.innerHTML = 'Select plan →';
        });
    });
    card.appendChild(button);

    return card;
  }

  function mount(root) {
    var product = root.getAttribute('data-product') || new URLSearchParams(location.search).get('product');
    if (product !== 'hrt' && product !== 'glp1') {
      root.innerHTML = '<p>Missing or invalid product. Set data-product="hrt" or "glp1" on this element.</p>';
      return;
    }
    root.innerHTML = '';
    var grid = el('div', { class: 'th-plans-grid' });
    PLANS[product].forEach(function (plan) { grid.appendChild(renderPlanCard(plan)); });
    root.appendChild(grid);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('th-plans-app');
    if (root) mount(root);
  });
})();
