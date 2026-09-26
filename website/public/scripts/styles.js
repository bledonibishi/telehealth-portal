// Baseline styling for the quiz.js / checkout.js widgets. Load once, site-wide.
// Override any of these by targeting the same class names in Webflow's own CSS —
// these rules carry no !important (except the feature-flag hide helper in feature-flags.js).
(function () {
  var css = [
    '.th-quiz-progress-track{width:100%;height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:24px}',
    '.th-quiz-progress-bar{height:100%;background:#4f46e5;border-radius:999px;transition:width .3s}',
    '.th-quiz-step-label{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px}',
    '.th-quiz-title{font-size:24px;font-weight:700;color:#0f172a;margin:0 0 4px}',
    '.th-quiz-subtext{color:#64748b;font-size:14px;margin:0 0 20px}',
    '.th-quiz-options{display:flex;flex-direction:column;gap:10px;margin-bottom:24px}',
    '.th-quiz-option{text-align:left;padding:14px 18px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;color:#334155;font-size:14px;font-weight:500;cursor:pointer}',
    '.th-quiz-option:hover{border-color:#cbd5e1}',
    '.th-quiz-option-selected{border-color:#4f46e5;background:#eef2ff;color:#0f172a}',
    '.th-quiz-nav{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.th-quiz-back{background:none;border:none;color:#64748b;font-size:14px;cursor:pointer}',
    '.th-quiz-back:disabled{opacity:.3;cursor:not-allowed}',
    '.th-quiz-next{background:#4f46e5;color:#fff;border:none;padding:12px 24px;border-radius:12px;font-weight:600;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}',
    '.th-quiz-next:disabled{opacity:.4;cursor:not-allowed}',
    '.th-quiz-result{text-align:center}',
    '.th-quiz-lead-form{display:flex;flex-direction:column;gap:12px;max-width:360px;margin:24px auto 0}',
    '.th-quiz-input{padding:12px 14px;border-radius:10px;border:1px solid #cbd5e1;font-size:14px}',
    '.th-quiz-error,.th-plan-error{color:#dc2626;font-size:13px;margin:4px 0}',
    '.th-plans-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}',
    '.th-plan-card{position:relative;border:2px solid #e2e8f0;border-radius:16px;padding:32px;display:flex;flex-direction:column}',
    '.th-plan-card-popular{border-color:#4f46e5;box-shadow:0 4px 20px rgba(79,70,229,.15)}',
    '.th-plan-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#4f46e5;color:#fff;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:4px 14px;border-radius:999px}',
    '.th-plan-name{font-size:20px;font-weight:700;color:#0f172a;margin:0 0 4px}',
    '.th-plan-tagline{color:#64748b;font-size:14px;margin:0 0 16px}',
    '.th-plan-price{font-size:32px;font-weight:800;color:#0f172a;margin-bottom:20px}',
    '.th-plan-interval{font-size:14px;font-weight:400;color:#94a3b8}',
    '.th-plan-features{list-style:none;padding:0;margin:0 0 24px;flex:1;font-size:14px;color:#334155;display:flex;flex-direction:column;gap:8px}',
    '.th-plan-features li:before{content:"✓ ";color:#4f46e5;font-weight:700}',
    '.th-plan-select{width:100%;padding:14px;border:none;border-radius:12px;background:#4f46e5;color:#fff;font-weight:600;font-size:14px;cursor:pointer}',
    '.th-plan-select:disabled{opacity:.6;cursor:not-allowed}',
  ].join('\n');

  var style = document.createElement('style');
  style.setAttribute('data-source', 'telehealth-widgets');
  style.textContent = css;
  document.head.appendChild(style);
})();
