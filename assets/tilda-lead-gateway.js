(function () {
  'use strict';

  var ROOT_SELECTOR = '[data-academy-tilda-lead], .js-academy-tilda-lead';
  var START_SELECTOR = '[data-lead-verification-start]';
  var STATUS_SELECTOR = '[data-lead-status]';
  var CODE_WRAP_SELECTOR = '[data-lead-verification-code-wrap]';
  var CODE_SELECTOR = '[name="verificationCode"], [data-lead-verification-code]';

  function trim(value) {
    return value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
  }

  function resolveApiBase(root) {
    var explicit = trim(root.getAttribute('data-api-base'));
    if (explicit) return explicit.replace(/\/+$/, '');

    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i += 1) {
      var src = scripts[i].src || '';
      if (src.indexOf('/assets/tilda-lead-gateway.js') !== -1) {
        try {
          return new URL(src).origin;
        } catch (error) {
          return '';
        }
      }
    }

    return '';
  }

  function normalizePhone(value) {
    var raw = trim(value);
    var digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    var normalized = '+' + digits;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : '';
  }

  function setStatus(root, message, state) {
    var target = root.querySelector(STATUS_SELECTOR);
    if (!target) return;
    target.textContent = message || '';
    target.setAttribute('data-lead-status-state', state || '');
  }

  function getForm(root) {
    if (root.tagName && root.tagName.toLowerCase() === 'form') return root;
    return root.querySelector('form');
  }

  function getField(form, names) {
    for (var i = 0; i < names.length; i += 1) {
      var field = form.querySelector('[name="' + names[i] + '"]');
      if (field) return field;
    }
    return null;
  }

  function getFieldValue(form, names) {
    var field = getField(form, names);
    return field ? trim(field.value) : '';
  }

  function getChannel(form) {
    var checked = form.querySelector('[name="verificationChannel"]:checked');
    if (checked) return trim(checked.value);

    var field = getField(form, ['verificationChannel', 'channel']);
    return field ? trim(field.value) : 'sms';
  }

  function ensureHidden(form, name) {
    var field = form.querySelector('[name="' + name + '"]');
    if (field) return field;

    field = document.createElement('input');
    field.type = 'hidden';
    field.name = name;
    form.appendChild(field);
    return field;
  }

  function collectPayload(root, form) {
    var data = {};
    var formData = new FormData(form);
    formData.forEach(function (value, key) {
      data[key] = typeof value === 'string' ? value : '';
    });

    data.pageUrl = data.pageUrl || window.location.href;
    data.formId = data.formId || trim(root.getAttribute('data-form-id')) || trim(form.getAttribute('id'));
    data.courseSlug = data.courseSlug || trim(root.getAttribute('data-course-slug'));
    data.leadType = data.leadType || trim(root.getAttribute('data-lead-type')) || 'course_request';
    data.sigmaRoute = data.sigmaRoute || trim(root.getAttribute('data-sigma-route'));
    data.token = data.token || trim(root.getAttribute('data-lead-token'));

    var params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
      if (!data[key] && params.get(key)) data[key] = params.get(key);
    });

    return data;
  }

  function postJson(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (body) {
        if (!response.ok || body.ok === false) {
          var error = new Error(body.error || 'Request failed.');
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  function toggleCodeInput(root, visible) {
    var wrap = root.querySelector(CODE_WRAP_SELECTOR);
    if (wrap) wrap.hidden = !visible;
  }

  function validateBase(root, form) {
    var phone = normalizePhone(getFieldValue(form, ['phone', 'Phone', 'tel']));
    if (!phone) {
      setStatus(root, 'Введите корректный телефон.', 'error');
      return null;
    }

    return phone;
  }

  function startVerification(root) {
    var form = getForm(root);
    if (!form) return Promise.reject(new Error('Form not found.'));

    var phone = validateBase(root, form);
    if (!phone) return Promise.resolve(false);

    var apiBase = resolveApiBase(root);
    var payload = collectPayload(root, form);
    payload.phone = phone;
    payload.channel = getChannel(form);

    setStatus(root, 'Отправляем код...', 'loading');
    return postJson(apiBase + '/api/tilda/lead-verification/start', payload)
      .then(function (body) {
        ensureHidden(form, 'verificationId').value = body.verificationId || '';
        toggleCodeInput(root, true);
        setStatus(root, 'Код отправлен. Введите его в форму.', 'success');
        root.dispatchEvent(new CustomEvent('academy:tilda:lead-verification-sent', {
          detail: body
        }));
        return true;
      })
      .catch(function (error) {
        var retryAfter = error.body && error.body.retryAfterSeconds
          ? ' Повторите через ' + error.body.retryAfterSeconds + ' сек.'
          : '';
        setStatus(root, (error.message || 'Не удалось отправить код.') + retryAfter, 'error');
        root.dispatchEvent(new CustomEvent('academy:tilda:lead-verification-error', {
          detail: { error: error }
        }));
        return false;
      });
  }

  function submitLead(root, event) {
    var form = getForm(root);
    if (!form) return;

    event.preventDefault();

    var phone = validateBase(root, form);
    if (!phone) return;

    var codeField = form.querySelector(CODE_SELECTOR);
    var verificationId = getFieldValue(form, ['verificationId']);
    var code = codeField ? trim(codeField.value).replace(/\D/g, '') : '';

    if (!verificationId) {
      startVerification(root);
      return;
    }

    if (!code) {
      toggleCodeInput(root, true);
      setStatus(root, 'Введите код подтверждения.', 'error');
      return;
    }

    var apiBase = resolveApiBase(root);
    var payload = collectPayload(root, form);
    payload.phone = phone;
    payload.verificationId = verificationId;
    payload.verificationCode = code;

    setStatus(root, 'Отправляем заявку...', 'loading');
    postJson(apiBase + '/api/tilda/leads', payload)
      .then(function (body) {
        setStatus(root, 'Заявка отправлена.', 'success');
        root.dispatchEvent(new CustomEvent('academy:tilda:lead-sent', {
          detail: body
        }));
        if (root.getAttribute('data-reset-on-success') !== 'false') form.reset();
      })
      .catch(function (error) {
        setStatus(root, error.message || 'Не удалось отправить заявку.', 'error');
        root.dispatchEvent(new CustomEvent('academy:tilda:lead-error', {
          detail: { error: error }
        }));
      });
  }

  function bindRoot(root) {
    if (!root || root.__academyTildaLeadBound) return;
    var form = getForm(root);
    if (!form) return;

    root.__academyTildaLeadBound = true;
    toggleCodeInput(root, false);

    var startButton = root.querySelector(START_SELECTOR);
    if (startButton) {
      startButton.addEventListener('click', function () {
        startVerification(root);
      });
    }

    form.addEventListener('submit', function (event) {
      submitLead(root, event);
    });
  }

  function init() {
    var roots = document.querySelectorAll(ROOT_SELECTOR);
    for (var i = 0; i < roots.length; i += 1) bindRoot(roots[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
