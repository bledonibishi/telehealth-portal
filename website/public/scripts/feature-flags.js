// Feature flags + experiments, powered by PostHog. Load on every page, after config.js.
//
// Usage in Webflow:
//   - To gate an element on a flag being enabled, add the attribute:
//       data-th-flag="my-flag-key"
//     The element is hidden until the flag resolves, then shown/kept-hidden based on its value.
//   - To gate on a specific multivariate value (i.e. an experiment variant), add:
//       data-th-flag="my-experiment-key" data-th-flag-value="variant-b"
//   - Elements are hidden via the "th-flag-hidden" class (display: none), not removed,
//     so Webflow interactions/animations bound to them still work once shown.
(function () {
  var config = window.TELEHEALTH_CONFIG;
  if (!config || !config.posthog || !config.posthog.key) {
    console.warn('[telehealth] feature-flags.js: window.TELEHEALTH_CONFIG.posthog is not set, skipping.');
    return;
  }

  var style = document.createElement('style');
  style.textContent = '.th-flag-hidden { display: none !important; }';
  document.head.appendChild(style);

  document.querySelectorAll('[data-th-flag]').forEach(function (el) {
    el.classList.add('th-flag-hidden');
  });

  function applyFlags(flags, payloads) {
    document.querySelectorAll('[data-th-flag]').forEach(function (el) {
      var key = el.getAttribute('data-th-flag');
      var expectedValue = el.getAttribute('data-th-flag-value');
      var actual = flags[key];

      var matches = expectedValue ? actual === expectedValue : !!actual;
      el.classList.toggle('th-flag-hidden', !matches);
    });

    window.dispatchEvent(new CustomEvent('telehealth:flagsReady', { detail: { flags: flags, payloads: payloads } }));
  }

  // Minimal PostHog loader (see https://posthog.com/docs/libraries/js for the full snippet).
  !function (t, e) {
    var o, n, p, r;
    e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) {
      function g(t, e) { var o = e.split('.'); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) }; }
      (p = t.createElement('script')).type = 'text/javascript', p.crossOrigin = 'anonymous', p.async = !0, p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js', (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
      var u = e; for (void 0 !== a ? u = e[a] = [] : a = 'posthog', u.people = u.people || [], u.toString = function (t) { var e = 'posthog'; return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e }, u.people.toString = function () { return u.toString(1) + '.people (stub)' }, o = 'init capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys'.split(' '), n = 0; n < o.length; n++)g(u, o[n]);
      e._i.push([i, s, a])
    }, e.__SV = 1)
  }(document, window.posthog || []);

  posthog.init(config.posthog.key, { api_host: config.posthog.host, persistence: 'localStorage+cookie' });

  posthog.onFeatureFlags(function () {
    var flags = {};
    Object.keys(posthog.featureFlags.getFlagVariants()).forEach(function (key) {
      flags[key] = posthog.getFeatureFlag(key);
    });
    var payloads = {};
    Object.keys(flags).forEach(function (key) {
      payloads[key] = posthog.getFeatureFlagPayload(key);
    });
    window.featureFlags = flags;
    applyFlags(flags, payloads);
  });
})();
