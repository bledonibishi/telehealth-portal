// Eligibility quiz engine. Mounts into a single container element on the Webflow quiz page.
//
// Usage in Webflow:
//   <div id="th-quiz-app"
//        data-product="hrt"                    (or "glp1" — falls back to ?product= query param)
//        data-plans-url="/plans"                (optional, defaults shown)
//        data-quiz-url-hrt="/quiz?product=hrt"  (optional, used on the "try the other quiz" link)
//        data-quiz-url-glp1="/quiz?product=glp1"
//        data-home-url="/">                     (optional)
//   </div>
// Load after config.js. Requires no other markup — the widget renders everything inside the div.
(function () {
  var HRT_QUESTIONS = [
    {
      id: 'age', text: 'How old are you?', type: 'single',
      options: [
        { id: 'under18', label: 'Under 18', disqualifies: true },
        { id: '18to45', label: '18 – 45', isPositive: true },
        { id: '46to55', label: '46 – 55', isPositive: true },
        { id: '56to65', label: '56 – 65', isPositive: true },
        { id: 'over65', label: 'Over 65', disqualifies: true },
      ],
    },
    {
      id: 'symptoms', text: 'Which symptoms are you currently experiencing?', subtext: 'Select all that apply.',
      type: 'multi', requiresPositive: true,
      options: [
        { id: 'hot_flushes', label: 'Hot flushes or night sweats', isPositive: true },
        { id: 'mood', label: 'Mood changes, anxiety or depression', isPositive: true },
        { id: 'brain_fog', label: 'Brain fog or poor concentration', isPositive: true },
        { id: 'libido', label: 'Low libido', isPositive: true },
        { id: 'sleep', label: 'Sleep disturbances', isPositive: true },
        { id: 'joint_pain', label: 'Joint pain or muscle aches', isPositive: true },
        { id: 'none', label: 'None of the above', noneOfAbove: true, disqualifies: true },
      ],
    },
    {
      id: 'contraindications', text: 'Have you ever been diagnosed with any of the following?', subtext: 'Select all that apply.',
      type: 'multi',
      options: [
        { id: 'breast_cancer', label: 'Breast cancer or hormone-sensitive cancer', disqualifies: true },
        { id: 'blood_clots', label: 'Blood clots (DVT or pulmonary embolism)', disqualifies: true },
        { id: 'stroke', label: 'Stroke or heart attack in the past 12 months', disqualifies: true },
        { id: 'undiagnosed_bleeding', label: 'Unexplained vaginal bleeding', disqualifies: true },
        { id: 'none', label: 'None of the above', noneOfAbove: true },
      ],
    },
    {
      id: 'pregnancy', text: 'Are you currently pregnant or breastfeeding?', type: 'single',
      options: [
        { id: 'yes', label: 'Yes', disqualifies: true },
        { id: 'no', label: 'No' },
      ],
    },
    {
      id: 'hypertension', text: 'Do you have uncontrolled high blood pressure (above 160/100 mmHg)?', type: 'single',
      options: [
        { id: 'yes', label: 'Yes', disqualifies: true },
        { id: 'no', label: 'No' },
        { id: 'unknown', label: "I don't know" },
      ],
    },
  ];

  var GLP1_QUESTIONS = [
    {
      id: 'age', text: 'How old are you?', type: 'single',
      options: [
        { id: 'under18', label: 'Under 18', disqualifies: true },
        { id: '18to75', label: '18 – 75', isPositive: true },
        { id: 'over75', label: 'Over 75', disqualifies: true },
      ],
    },
    {
      id: 'bmi', text: 'What is your approximate BMI?',
      subtext: 'GLP-1 treatment is suitable for a BMI of 30+ or 27–29 with a weight-related health condition.',
      type: 'single', requiresPositive: true,
      options: [
        { id: 'under27', label: 'Under 27', disqualifies: true },
        { id: '27to29_condition', label: '27 – 29, and I have a weight-related condition (e.g. type 2 diabetes, high blood pressure)', isPositive: true },
        { id: '30plus', label: '30 or above', isPositive: true },
        { id: 'unknown', label: "I don't know my BMI" },
      ],
    },
    {
      id: 'contraindications', text: 'Have you ever been diagnosed with any of the following?', subtext: 'Select all that apply.',
      type: 'multi',
      options: [
        { id: 'type1_diabetes', label: 'Type 1 diabetes', disqualifies: true },
        { id: 'mtc', label: 'Medullary thyroid carcinoma (MTC) or MEN2 syndrome', disqualifies: true },
        { id: 'pancreatitis', label: 'Pancreatitis', disqualifies: true },
        { id: 'none', label: 'None of the above', noneOfAbove: true },
      ],
    },
    {
      id: 'pregnancy', text: 'Are you currently pregnant, breastfeeding, or planning to become pregnant in the next 6 months?', type: 'single',
      options: [
        { id: 'yes', label: 'Yes', disqualifies: true },
        { id: 'no', label: 'No' },
      ],
    },
    {
      id: 'gi_disorders', text: 'Do you have a history of severe gastrointestinal disorders (e.g. gastroparesis or inflammatory bowel disease)?', type: 'single',
      options: [
        { id: 'yes', label: 'Yes', disqualifies: true },
        { id: 'no', label: 'No' },
      ],
    },
  ];

  var QUIZZES = { hrt: HRT_QUESTIONS, glp1: GLP1_QUESTIONS };
  var PRODUCT_LABEL = { hrt: 'HRT', glp1: 'GLP-1' };

  function isDisqualified(question, selectedIds) {
    return question.options.some(function (o) { return o.disqualifies && selectedIds.indexOf(o.id) !== -1; });
  }

  function hasPositiveSelection(question, selectedIds) {
    if (!question.requiresPositive) return true;
    return question.options.some(function (o) { return o.isPositive && selectedIds.indexOf(o.id) !== -1; });
  }

  function checkEligibility(questions, answers) {
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var selected = answers[q.id] || [];
      if (isDisqualified(q, selected)) return 'ineligible';
      if (q.requiresPositive && !hasPositiveSelection(q, selected)) return 'ineligible';
    }
    return 'eligible';
  }

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

  function text(tag, className, str) {
    return el(tag, { class: className, html: str });
  }

  function createLead(input) {
    var config = window.TELEHEALTH_CONFIG;
    return fetch(config.graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation CreateLead($input: CreateLeadInput!) { createLead(input: $input) { id } }',
        variables: { input: input },
      }),
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (json.errors) throw new Error(json.errors[0].message);
      return json.data.createLead;
    });
  }

  function mount(root) {
    var product = root.getAttribute('data-product') || new URLSearchParams(location.search).get('product');
    if (product !== 'hrt' && product !== 'glp1') {
      root.innerHTML = '<p>Missing or invalid product. Set data-product="hrt" or "glp1" on this element.</p>';
      return;
    }

    var plansUrl = root.getAttribute('data-plans-url') || '/plans';
    var quizUrlHrt = root.getAttribute('data-quiz-url-hrt') || '/quiz?product=hrt';
    var quizUrlGlp1 = root.getAttribute('data-quiz-url-glp1') || '/quiz?product=glp1';
    var homeUrl = root.getAttribute('data-home-url') || '/';

    var questions = QUIZZES[product];
    var step = 0;
    var answers = {};

    function render() {
      root.innerHTML = '';
      root.appendChild(renderProgress());
      root.appendChild(renderQuestion());
    }

    function renderProgress() {
      var track = el('div', { class: 'th-quiz-progress-track' });
      var bar = el('div', { class: 'th-quiz-progress-bar' });
      bar.style.width = (((step + 1) / questions.length) * 100) + '%';
      track.appendChild(bar);
      return track;
    }

    function renderQuestion() {
      var q = questions[step];
      var selected = answers[q.id] || [];
      var wrap = el('div', { class: 'th-quiz-question' });

      wrap.appendChild(text('div', 'th-quiz-step-label', 'Question ' + (step + 1) + ' of ' + questions.length));
      wrap.appendChild(text('h2', 'th-quiz-title', q.text));
      if (q.subtext) wrap.appendChild(text('p', 'th-quiz-subtext', q.subtext));

      var optionsWrap = el('div', { class: 'th-quiz-options' });
      q.options.forEach(function (opt) {
        var isSelected = selected.indexOf(opt.id) !== -1;
        var btn = el('button', {
          type: 'button',
          class: 'th-quiz-option' + (isSelected ? ' th-quiz-option-selected' : ''),
          html: opt.label,
          onclick: function () { toggleOption(q, opt, selected); },
        });
        optionsWrap.appendChild(btn);
      });
      wrap.appendChild(optionsWrap);

      var nav = el('div', { class: 'th-quiz-nav' });
      var backBtn = el('button', {
        type: 'button', class: 'th-quiz-back', html: '← Back',
        onclick: function () { if (step > 0) { step -= 1; render(); } },
      });
      if (step === 0) backBtn.setAttribute('disabled', 'true');
      var nextBtn = el('button', {
        type: 'button', class: 'th-quiz-next',
        html: step === questions.length - 1 ? 'See my result' : 'Next →',
        onclick: handleNext,
      });
      if (selected.length === 0) nextBtn.setAttribute('disabled', 'true');
      nav.appendChild(backBtn);
      nav.appendChild(nextBtn);
      wrap.appendChild(nav);

      return wrap;
    }

    function toggleOption(question, opt, selected) {
      var next;
      if (question.type === 'single') {
        next = [opt.id];
      } else if (opt.noneOfAbove) {
        next = selected.indexOf(opt.id) !== -1 ? [] : [opt.id];
      } else {
        var withoutNone = selected.filter(function (id) {
          var o = question.options.filter(function (o) { return o.id === id; })[0];
          return !(o && o.noneOfAbove);
        });
        next = withoutNone.indexOf(opt.id) !== -1
          ? withoutNone.filter(function (id) { return id !== opt.id; })
          : withoutNone.concat([opt.id]);
      }
      answers[question.id] = next;
      render();
    }

    function handleNext() {
      if (step < questions.length - 1) {
        step += 1;
        render();
      } else {
        var result = checkEligibility(questions, answers);
        if (window.posthog) posthog.capture('quiz_completed', { product: product, result: result });
        if (result === 'eligible') renderEligible();
        else renderIneligible();
      }
    }

    function quizAnswersForLead() {
      return questions.map(function (q) {
        var selected = answers[q.id] || [];
        var labels = selected.map(function (id) {
          var o = q.options.filter(function (o) { return o.id === id; })[0];
          return o ? o.label : id;
        });
        return { questionId: q.id, question: q.text, answer: labels.join(', ') };
      });
    }

    function renderEligible() {
      root.innerHTML = '';
      var wrap = el('div', { class: 'th-quiz-result' });
      wrap.appendChild(text('h2', 'th-quiz-title', 'Great news — you appear eligible!'));
      wrap.appendChild(text('p', 'th-quiz-subtext',
        'Based on your answers, ' + PRODUCT_LABEL[product] + ' treatment may be suitable for you. ' +
        'Enter your details to continue — a clinician will review your case before issuing a prescription.'));

      var form = el('form', { class: 'th-quiz-lead-form' });
      var firstName = el('input', { type: 'text', placeholder: 'First name', required: 'true', class: 'th-quiz-input' });
      var lastName = el('input', { type: 'text', placeholder: 'Last name', required: 'true', class: 'th-quiz-input' });
      var email = el('input', { type: 'email', placeholder: 'Email address', required: 'true', class: 'th-quiz-input' });
      var errorMsg = el('p', { class: 'th-quiz-error' });
      var submitBtn = el('button', { type: 'submit', class: 'th-quiz-next', html: 'Continue to plans →' });

      form.appendChild(firstName);
      form.appendChild(lastName);
      form.appendChild(email);
      form.appendChild(errorMsg);
      form.appendChild(submitBtn);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submitBtn.setAttribute('disabled', 'true');
        submitBtn.innerHTML = 'Submitting…';
        errorMsg.innerHTML = '';

        createLead({
          email: email.value,
          firstName: firstName.value,
          lastName: lastName.value,
          productKind: product.toUpperCase(),
          quizAnswers: quizAnswersForLead(),
        }).then(function (lead) {
          sessionStorage.setItem('th_lead', JSON.stringify({ id: lead.id, email: email.value, product: product }));
          if (window.posthog) posthog.identify(email.value, { product: product });
          location.href = plansUrl + (plansUrl.indexOf('?') === -1 ? '?' : '&') + 'product=' + product;
        }).catch(function (err) {
          errorMsg.innerHTML = err.message || 'Something went wrong. Please try again.';
          submitBtn.removeAttribute('disabled');
          submitBtn.innerHTML = 'Continue to plans →';
        });
      });

      wrap.appendChild(form);
      root.appendChild(wrap);
    }

    function renderIneligible() {
      root.innerHTML = '';
      var otherProduct = product === 'hrt' ? 'glp1' : 'hrt';
      var otherUrl = product === 'hrt' ? quizUrlGlp1 : quizUrlHrt;
      var wrap = el('div', { class: 'th-quiz-result' });
      wrap.appendChild(text('h2', 'th-quiz-title', 'Unfortunately, not right now'));
      wrap.appendChild(text('p', 'th-quiz-subtext',
        'Based on your answers, ' + PRODUCT_LABEL[product] + ' may not be suitable for you at this time. ' +
        'We strongly recommend speaking to your GP who can discuss alternatives.'));

      var actions = el('div', { class: 'th-quiz-nav' });
      actions.appendChild(el('a', { href: otherUrl, class: 'th-quiz-next', html: 'Try the ' + PRODUCT_LABEL[otherProduct] + ' quiz instead' }));
      actions.appendChild(el('a', { href: homeUrl, class: 'th-quiz-back', html: 'Back to home' }));
      wrap.appendChild(actions);
      root.appendChild(wrap);
    }

    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('th-quiz-app');
    if (root) mount(root);
  });
})();
