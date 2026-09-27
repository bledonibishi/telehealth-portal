// Eligibility quiz engine for the HRT / GLP-1 assessment pages built in Webflow.
//
// Targets the markup already built in the Webflow Designer (see website/README.md):
//   [data-th-quiz="HRT"|"GLP1"]     mount point — quiz questions render inside it
//   [data-th-screen="quiz|ineligible|plans"]   sibling screens, shown/hidden by this script
//   [data-th-reason]                ineligible screen's reason text
//   [data-th-restart]               ineligible screen's "review my answers" link
//   [data-th-plan="HRT_STARTER"...] plan buttons on the pre-built plans screen
//   [data-th-checkout-error]        error text shown if plan selection fails
//
// Load after config.js. No mount markup needed beyond what's already on the page —
// this script only toggles screens and fills in the quiz questions themselves.
(function () {
  var NONE = 'none';

  var HRT_QUESTIONS = [
    {
      id: 'age', text: 'How old are you?', type: 'single',
      options: [
        { id: 'under18', label: 'Under 18', disqualifies: true },
        { id: '18to45', label: '18 – 45' },
        { id: '46to55', label: '46 – 55' },
        { id: '56to65', label: '56 – 65' },
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
        { id: NONE, label: 'None of the above', noneOfAbove: true, disqualifies: true },
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
        { id: NONE, label: 'None of the above', noneOfAbove: true },
      ],
    },
    {
      id: 'pregnancy', text: 'Are you currently pregnant?', type: 'single',
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
      ],
    },
  ];

  var GLP1_QUESTIONS = [
    {
      id: 'age', text: 'How old are you?', type: 'single',
      options: [
        { id: 'under18', label: 'Under 18', disqualifies: true },
        { id: '18to75', label: '18 – 75' },
        { id: 'over75', label: 'Over 75', disqualifies: true },
      ],
    },
    {
      id: 'bmi', text: 'What is your approximate BMI?',
      subtext: 'GLP-1 treatment is suitable for a BMI of 30+, or 27–29 with a weight-related health condition.',
      type: 'single', requiresPositive: true,
      options: [
        { id: 'under27', label: 'Under 27', disqualifies: true },
        { id: '27to29_condition', label: '27 – 29, with a weight-related condition (e.g. type 2 diabetes, high blood pressure)', isPositive: true },
        { id: '30plus', label: '30 or above', isPositive: true },
      ],
    },
    {
      id: 'contraindications', text: 'Have you ever been diagnosed with any of the following?', subtext: 'Select all that apply.',
      type: 'multi',
      options: [
        { id: 'type1_diabetes', label: 'Type 1 diabetes', disqualifies: true },
        { id: 'mtc', label: 'Medullary thyroid carcinoma (MTC) or MEN2 syndrome', disqualifies: true },
        { id: 'pancreatitis', label: 'Pancreatitis', disqualifies: true },
        { id: NONE, label: 'None of the above', noneOfAbove: true },
      ],
    },
    {
      id: 'pregnancy', text: 'Are you pregnant, breastfeeding, or planning a pregnancy in the next 6 months?', type: 'single',
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

  var QUIZZES = { HRT: HRT_QUESTIONS, GLP1: GLP1_QUESTIONS };

  function isDisqualified(question, selectedIds) {
    return question.options.some(function (o) { return o.disqualifies && selectedIds.indexOf(o.id) !== -1; });
  }

  function hasPositiveSelection(question, selectedIds) {
    if (!question.requiresPositive) return true;
    return question.options.some(function (o) { return o.isPositive && selectedIds.indexOf(o.id) !== -1; });
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

  document.addEventListener('DOMContentLoaded', function () {
    var mount = document.querySelector('[data-th-quiz]');
    if (!mount) return;

    var product = mount.getAttribute('data-th-quiz'); // "HRT" or "GLP1"
    var questions = QUIZZES[product];
    if (!questions) return;

    var config = window.TELEHEALTH_CONFIG || {};
    var reasonEl = document.querySelector('[data-th-reason]');
    var restartLink = document.querySelector('[data-th-restart]');
    var checkoutError = document.querySelector('[data-th-checkout-error]');

    var step = 0;
    var answers = {};
    var lead = null; // set once createLead succeeds: { id, email, firstName, lastName }

    function showScreen(name) {
      document.querySelectorAll('[data-th-screen]').forEach(function (s) {
        s.style.display = s.getAttribute('data-th-screen') === name ? '' : 'none';
      });
      window.scrollTo({ top: mount.getBoundingClientRect().top + window.scrollY - 24, behavior: 'smooth' });
    }

    function render() {
      mount.innerHTML = '';
      mount.appendChild(renderProgress());
      mount.appendChild(renderQuestion());
    }

    function renderProgress() {
      var wrap = el('div', { class: 'th-quiz-progress-track' });
      var bar = el('div', { class: 'th-quiz-progress-bar' });
      bar.style.width = (((step + 1) / questions.length) * 100) + '%';
      wrap.appendChild(bar);
      return wrap;
    }

    function renderQuestion() {
      var q = questions[step];
      var selected = answers[q.id] || [];
      var wrap = el('div', { class: 'th-quiz-question' });

      wrap.appendChild(text('div', 'th-quiz-step-label', 'Question ' + (step + 1) + ' of ' + questions.length));
      wrap.appendChild(text('h2', 'th-quiz-title', q.text));
      if (q.subtext) wrap.appendChild(text('p', 'th-quiz-subtext', q.subtext));

      var optionsWrap = el('div', { class: 'th-quiz-options' });
      var buttons = q.options.map(function (opt) {
        var btn = el('button', {
          type: 'button',
          class: 'th-quiz-option' + (selected.indexOf(opt.id) !== -1 ? ' th-quiz-option-selected' : ''),
          html: opt.label,
        });
        btn.addEventListener('click', function () { toggleOption(q, opt, btn, optionsWrap); });
        optionsWrap.appendChild(btn);
        return btn;
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

      function toggleOption(question, opt, btn, wrapEl) {
        var sel = answers[question.id] || [];
        var next;
        if (question.type === 'single') {
          next = [opt.id];
        } else if (opt.noneOfAbove) {
          next = sel.indexOf(opt.id) !== -1 ? [] : [opt.id];
        } else {
          var withoutNone = sel.filter(function (id) { return id !== NONE; });
          next = withoutNone.indexOf(opt.id) !== -1
            ? withoutNone.filter(function (id) { return id !== opt.id; })
            : withoutNone.concat([opt.id]);
        }
        answers[question.id] = next;
        buttons.forEach(function (b, i) {
          b.classList.toggle('th-quiz-option-selected', next.indexOf(q.options[i].id) !== -1);
        });
        nextBtn.toggleAttribute('disabled', next.length === 0);
      }
    }

    function handleNext() {
      var q = questions[step];
      var selected = answers[q.id] || [];
      if (isDisqualified(q, selected) || !hasPositiveSelection(q, selected)) {
        return showIneligible();
      }
      if (step < questions.length - 1) {
        step += 1;
        render();
      } else {
        renderLeadForm();
      }
    }

    function showIneligible() {
      if (reasonEl) {
        reasonEl.textContent = 'Based on your answers, ' + (product === 'HRT' ? 'HRT' : 'GLP-1') +
          ' treatment does not look suitable for you right now. Please speak to your GP, who can discuss alternatives.';
      }
      showScreen('ineligible');
    }

    function renderLeadForm() {
      mount.innerHTML = '';
      mount.appendChild(text('h2', 'th-quiz-title', "You're eligible — where should we send your plan?"));

      var firstName = el('input', { type: 'text', placeholder: 'First name', class: 'th-quiz-input' });
      var lastName = el('input', { type: 'text', placeholder: 'Last name', class: 'th-quiz-input' });
      var email = el('input', { type: 'email', placeholder: 'Email address', class: 'th-quiz-input' });
      var errorMsg = el('p', { class: 'th-quiz-error' });
      var submitBtn = el('button', { type: 'button', class: 'th-quiz-next', html: 'Continue to plans →' });

      [firstName, lastName, email].forEach(function (i) { mount.appendChild(i); });
      mount.appendChild(errorMsg);
      mount.appendChild(submitBtn);

      submitBtn.addEventListener('click', function () {
        var input = {
          email: email.value.trim(),
          firstName: firstName.value.trim(),
          lastName: lastName.value.trim(),
        };
        if (!input.firstName || !input.lastName || !/^\S+@\S+\.\S+$/.test(input.email)) {
          errorMsg.textContent = 'Please enter your name and a valid email.';
          return;
        }
        if (!config.graphqlUrl) {
          errorMsg.textContent = 'This page is not fully configured yet — please try again later.';
          return;
        }

        submitBtn.setAttribute('disabled', 'true');
        submitBtn.textContent = 'Submitting…';
        errorMsg.textContent = '';

        var quizAnswers = questions.map(function (q) {
          var selected = answers[q.id] || [];
          var labels = selected.map(function (id) {
            var o = q.options.filter(function (o) { return o.id === id; })[0];
            return o ? o.label : id;
          });
          return { questionId: q.id, question: q.text, answer: labels.join(', ') };
        });

        fetch(config.graphqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'mutation CreateLead($input: CreateLeadInput!) { createLead(input: $input) { id } }',
            variables: { input: Object.assign({ productKind: product, quizAnswers: quizAnswers }, input) },
          }),
        }).then(function (res) { return res.json(); }).then(function (json) {
          if (json.errors) throw new Error(json.errors[0].message);
          lead = { id: json.data.createLead.id, email: input.email, firstName: input.firstName, lastName: input.lastName };
          try {
            sessionStorage.setItem('th_lead', JSON.stringify(Object.assign({ product: product }, lead)));
          } catch (e) { /* private browsing etc. — checkout page falls back to "no session" screen */ }
          if (window.posthog) window.posthog.identify(input.email, { product: product });
          showScreen('plans');
        }).catch(function (err) {
          errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
          submitBtn.removeAttribute('disabled');
          submitBtn.textContent = 'Continue to plans →';
        });
      });
    }

    document.querySelectorAll('[data-th-plan]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        if (checkoutError) checkoutError.textContent = '';
        try {
          var session = JSON.parse(sessionStorage.getItem('th_lead') || 'null');
          if (!session) throw new Error('no session');
          session.planId = link.getAttribute('data-th-plan');
          sessionStorage.setItem('th_lead', JSON.stringify(session));
        } catch (e) {
          if (checkoutError) checkoutError.textContent = 'Something went wrong — please restart the assessment.';
          return;
        }
        window.location.href = '/checkout';
      });
    });

    if (restartLink) {
      restartLink.addEventListener('click', function (e) {
        e.preventDefault();
        step = 0;
        answers = {};
        render();
        showScreen('quiz');
      });
    }

    showScreen('quiz');
    render();
  });
})();
