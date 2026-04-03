(function () {
  'use strict';

  var ROOT_SELECTOR = '.js-tilda-course-fields, [data-tilda-course]';

  function toText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function isTruthy(value) {
    var text = toText(value).toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'on';
  }

  function normalizeBase(base) {
    var value = toText(base) || window.location.origin;
    return value.replace(/\/+$/, '');
  }

  function unique(values) {
    var seen = new Set();
    return values.filter(function (value) {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function getRequestedFields(root) {
    return unique(
      Array.prototype.slice.call(root.querySelectorAll('[data-course-field]'))
        .map(function (node) {
          return toText(node.getAttribute('data-course-field'));
        })
    );
  }

  function buildRequestUrl(root) {
    var apiBase = normalizeBase(root.getAttribute('data-api-base'));
    var slug = toText(root.getAttribute('data-course-slug'));
    var courseId = toText(root.getAttribute('data-course-id'));
    var documentId = toText(root.getAttribute('data-course-document-id'));
    var courseUrl = toText(root.getAttribute('data-course-url'));
    var coursePath = toText(root.getAttribute('data-course-path'));
    var fields = getRequestedFields(root);
    var params = new URLSearchParams();

    if (fields.length) {
      params.set('fields', fields.join(','));
    }

    if (courseId) {
      return apiBase + '/api/tilda/courses/' + encodeURIComponent(courseId) + (params.toString() ? '?' + params.toString() : '');
    }

    if (documentId) {
      return apiBase + '/api/tilda/courses/' + encodeURIComponent(documentId) + (params.toString() ? '?' + params.toString() : '');
    }

    if (slug) {
      return apiBase + '/api/tilda/courses/' + encodeURIComponent(slug) + (params.toString() ? '?' + params.toString() : '');
    }

    if (courseUrl) {
      params.set('url', courseUrl);
    } else {
      params.set('path', coursePath || window.location.pathname);
    }

    return apiBase + '/api/tilda/courses/resolve?' + params.toString();
  }

  function applyNodeValue(node, value) {
    var attrName = toText(node.getAttribute('data-course-attr'));
    var defaultValue = node.getAttribute('data-course-default');
    var finalValue = value;

    if ((finalValue === undefined || finalValue === null || finalValue === '') && defaultValue !== null) {
      finalValue = defaultValue;
    }

    if (attrName) {
      if (finalValue === undefined || finalValue === null || finalValue === '') {
        node.removeAttribute(attrName);
      } else {
        node.setAttribute(attrName, String(finalValue));
      }
    } else {
      node.textContent = finalValue === undefined || finalValue === null ? '' : String(finalValue);
    }

    if (isTruthy(node.getAttribute('data-course-hide-empty'))) {
      node.hidden = finalValue === undefined || finalValue === null || finalValue === '';
    }
  }

  function renderCourse(root, course) {
    var nodes = root.querySelectorAll('[data-course-field]');

    nodes.forEach(function (node) {
      var fieldName = toText(node.getAttribute('data-course-field'));
      applyNodeValue(node, course ? course[fieldName] : '');
    });

    root.setAttribute('data-course-state', 'success');
    root.dispatchEvent(new CustomEvent('academy:tilda:course-data', {
      detail: { course: course || null }
    }));
  }

  async function loadCourse(root) {
    if (!root || root.getAttribute('data-course-bound') === '1') return;
    root.setAttribute('data-course-bound', '1');
    root.setAttribute('data-course-state', 'loading');

    try {
      var response = await fetch(buildRequestUrl(root), {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      var payload = await response.json();
      renderCourse(root, payload && payload.data ? payload.data : null);
    } catch (error) {
      root.setAttribute('data-course-state', 'error');
      root.dispatchEvent(new CustomEvent('academy:tilda:course-error', {
        detail: { error: error }
      }));
      console.error('Failed to load Tilda course fields', error);
    }
  }

  function init() {
    var roots = document.querySelectorAll(ROOT_SELECTOR);
    if (!roots.length) return;

    roots.forEach(loadCourse);
  }

  if (typeof window.t_onReady === 'function') {
    window.t_onReady(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.setTimeout(init, 0);
  window.setTimeout(init, 600);
  window.setTimeout(init, 1500);
})();
