(function () {
  'use strict';

  var ROOT_SELECTOR = '.js-tilda-course-fields, [data-tilda-course]';
  var REQUEST_CACHE = new Map();
  var SCRIPT_SRC = (function () {
    var current = document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : '';
    if (current) return current;

    var scripts = document.querySelectorAll('script[src]');
    for (var index = scripts.length - 1; index >= 0; index -= 1) {
      var src = scripts[index].src || scripts[index].getAttribute('src') || '';
      if (src.indexOf('/assets/tilda-course-fields.js') !== -1) {
        return src;
      }
    }

    return '';
  })();

  function toText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function isTruthy(value) {
    var text = toText(value).toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'on';
  }

  function safeDecode(value) {
    var text = toText(value);
    if (!text) return '';

    try {
      return decodeURIComponent(text);
    } catch (error) {
      return text;
    }
  }

  function normalizePathname(value) {
    var text = toText(value);
    if (!text) return '';

    var withoutHost = text.replace(/^https?:\/\/[^/]+/i, '');
    var beforeHash = withoutHost.split('#')[0];
    var beforeQuery = beforeHash.split('?')[0];
    var decoded = safeDecode(beforeQuery);
    var path = decoded.charAt(0) === '/' ? decoded : '/' + decoded;

    return path
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '') || '/';
  }

  function normalizeAbsoluteUrl(value) {
    var text = toText(value);
    if (!text) return '';

    try {
      var parsed = new URL(text, window.location.href);
      parsed.hash = '';
      parsed.search = '';
      parsed.pathname = normalizePathname(parsed.pathname);
      return parsed.toString().replace(/\/+$/, '');
    } catch (error) {
      return '';
    }
  }

  function unique(values) {
    var seen = new Set();
    return values.filter(function (value) {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function splitFields(value) {
    return toText(value)
      .split(',')
      .map(function (field) {
        return toText(field);
      })
      .filter(Boolean);
  }

  function getGlobalConfig() {
    return window.ACADEMY_TILDA_COURSE && typeof window.ACADEMY_TILDA_COURSE === 'object'
      ? window.ACADEMY_TILDA_COURSE
      : {};
  }

  function getScriptBase() {
    if (!SCRIPT_SRC) return '';

    try {
      return new URL(SCRIPT_SRC, window.location.href).origin;
    } catch (error) {
      return '';
    }
  }

  function normalizeBase(base) {
    var value = toText(base)
      || toText(getGlobalConfig().apiBase)
      || getScriptBase()
      || window.location.origin;

    return value.replace(/\/+$/, '');
  }

  function readScopedAttribute(root, attributeName) {
    if (!attributeName) return '';

    var current = root;
    while (current && current.nodeType === 1) {
      var currentValue = current.getAttribute(attributeName);
      if (currentValue !== null && toText(currentValue)) {
        return toText(currentValue);
      }
      current = current.parentElement;
    }

    var bodyValue = document.body ? document.body.getAttribute(attributeName) : null;
    if (bodyValue !== null && toText(bodyValue)) {
      return toText(bodyValue);
    }

    var htmlValue = document.documentElement ? document.documentElement.getAttribute(attributeName) : null;
    if (htmlValue !== null && toText(htmlValue)) {
      return toText(htmlValue);
    }

    return '';
  }

  function readConfigValue(root, attributeName, configKey) {
    return readScopedAttribute(root, attributeName) || toText(getGlobalConfig()[configKey]);
  }

  function getMetaContent(selector) {
    var node = document.querySelector(selector);
    return node ? toText(node.getAttribute('content') || node.getAttribute('href')) : '';
  }

  function getDefaultPageUrl() {
    return normalizeAbsoluteUrl(
      getMetaContent('link[rel="canonical"]')
      || getMetaContent('meta[property="og:url"]')
      || getMetaContent('meta[name="og:url"]')
      || window.location.href
    );
  }

  function getDefaultPagePath() {
    return normalizePathname(
      readConfigValue(document.body || document.documentElement, 'data-course-path', 'path')
      || getDefaultPageUrl()
      || window.location.pathname
    );
  }

  function getRequestedFields(root) {
    var renderFields = Array.prototype.slice.call(root.querySelectorAll('[data-course-field]'))
      .map(function (node) {
        return toText(node.getAttribute('data-course-field')).split('.')[0];
      });
    var requestFields = Array.prototype.slice.call(root.querySelectorAll('[data-course-request-field]'))
      .map(function (node) {
        return toText(node.getAttribute('data-course-request-field')).split('.')[0];
      });
    var extraFields = splitFields(root.getAttribute('data-course-fields-extra'))
      .map(function (field) {
        return toText(field).split('.')[0];
      });

    return unique(renderFields.concat(requestFields).concat(extraFields));
  }

  function resolveFieldValue(source, path) {
    var fieldPath = toText(path);
    if (!fieldPath) return '';

    return fieldPath.split('.').reduce(function (value, part) {
      if (value === undefined || value === null) return undefined;
      if (!part) return value;

      if (Array.isArray(value) && /^\d+$/.test(part)) {
        return value[Number(part)];
      }

      return value[part];
    }, source);
  }

  function serializeDomValue(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (!value.length) return '';
      var serializedItems = value.map(function (item) {
        if (item === undefined || item === null) return '';
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          return String(item);
        }
        if (item && typeof item === 'object' && typeof item.label === 'string') {
          return item.label;
        }
        return '';
      }).filter(Boolean);

      return serializedItems.length ? serializedItems.join(', ') : JSON.stringify(value);
    }

    if (typeof value === 'object') {
      if (typeof value.label === 'string') return value.label;
      if (typeof value.projectedPriceLabel === 'string') return value.projectedPriceLabel;
      if (typeof value.title === 'string') return value.title;
      return JSON.stringify(value);
    }

    return String(value);
  }

  function buildRequest(root) {
    var apiBase = normalizeBase(readConfigValue(root, 'data-api-base', 'apiBase'));
    var slug = readConfigValue(root, 'data-course-slug', 'slug');
    var courseId = readConfigValue(root, 'data-course-id', 'id');
    var documentId = readConfigValue(root, 'data-course-document-id', 'documentId');
    var courseUrl = normalizeAbsoluteUrl(readConfigValue(root, 'data-course-url', 'url') || getDefaultPageUrl());
    var coursePath = normalizePathname(readConfigValue(root, 'data-course-path', 'path') || getDefaultPagePath());
    var courseTitle = readConfigValue(root, 'data-course-title', 'title') || document.title;
    var fields = getRequestedFields(root);
    var params = new URLSearchParams();

    if (fields.length) {
      params.set('fields', fields.join(','));
    }

    if (courseId) {
      return {
        url: apiBase + '/api/tilda/courses/' + encodeURIComponent(courseId) + (params.toString() ? '?' + params.toString() : ''),
        identifier: courseId,
      };
    }

    if (documentId) {
      return {
        url: apiBase + '/api/tilda/courses/' + encodeURIComponent(documentId) + (params.toString() ? '?' + params.toString() : ''),
        identifier: documentId,
      };
    }

    if (slug) {
      return {
        url: apiBase + '/api/tilda/courses/' + encodeURIComponent(slug) + (params.toString() ? '?' + params.toString() : ''),
        identifier: slug,
      };
    }

    if (courseUrl) {
      params.set('url', courseUrl);
    }

    if (coursePath) {
      params.set('path', coursePath);
    }

    if (courseTitle) {
      params.set('title', courseTitle);
    }

    return {
      url: apiBase + '/api/tilda/courses/resolve?' + params.toString(),
      identifier: courseUrl || coursePath || courseTitle,
    };
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
      node.textContent = serializeDomValue(finalValue);
    }

    if (isTruthy(node.getAttribute('data-course-hide-empty'))) {
      node.hidden = finalValue === undefined || finalValue === null || finalValue === '';
    }
  }

  function clearCourse(root) {
    var nodes = root.querySelectorAll('[data-course-field]');

    nodes.forEach(function (node) {
      applyNodeValue(node, '');
    });
  }

  function renderCourse(root, course, request, options) {
    var silent = Boolean(options && options.silent);

    if (!course) {
      clearCourse(root);
      root.__academyTildaCourseCache = null;
      root.setAttribute('data-course-state', 'not-found');
      if (!silent) {
        root.dispatchEvent(new CustomEvent('academy:tilda:course-not-found', {
          detail: { course: null, request: request || null }
        }));
      }
      return;
    }

    var nodes = root.querySelectorAll('[data-course-field]');

    nodes.forEach(function (node) {
      var fieldPath = toText(node.getAttribute('data-course-field'));
      applyNodeValue(node, resolveFieldValue(course, fieldPath));
    });

    root.__academyTildaCourseCache = {
      course: course,
      requestUrl: request && request.url ? request.url : ''
    };
    root.setAttribute('data-course-state', 'success');
    if (!silent) {
      root.dispatchEvent(new CustomEvent('academy:tilda:course-data', {
        detail: { course: course, request: request || null }
      }));
    }
  }

  function fetchCourse(requestUrl) {
    if (!REQUEST_CACHE.has(requestUrl)) {
      var requestPromise = fetch(requestUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      }).then(function (response) {
        return response.json().catch(function () {
          return null;
        }).then(function (payload) {
          if (!response.ok) {
            REQUEST_CACHE.delete(requestUrl);
          }

          return {
            ok: response.ok,
            status: response.status,
            payload: payload,
          };
        });
      }).catch(function (error) {
        REQUEST_CACHE.delete(requestUrl);
        throw error;
      });

      REQUEST_CACHE.set(requestUrl, requestPromise);
    }

    return REQUEST_CACHE.get(requestUrl);
  }

  async function loadCourse(root) {
    if (!root) return;

    var request = buildRequest(root);
    if (!request || !request.url) {
      root.setAttribute('data-course-state', 'idle');
      return;
    }

    if (root.getAttribute('data-course-state') === 'loading'
      && root.getAttribute('data-course-request-url') === request.url) {
      return;
    }

    if (root.getAttribute('data-course-state') === 'success'
      && root.getAttribute('data-course-request-url') === request.url) {
      var cachedCourse = root.__academyTildaCourseCache && root.__academyTildaCourseCache.course
        ? root.__academyTildaCourseCache.course
        : null;
      if (cachedCourse) {
        renderCourse(root, cachedCourse, request, { silent: true });
      }
      return;
    }

    if (root.getAttribute('data-course-state') === 'not-found'
      && root.getAttribute('data-course-request-url') === request.url) {
      return;
    }

    root.setAttribute('data-course-request-url', request.url);
    root.setAttribute('data-course-state', 'loading');
    root.dispatchEvent(new CustomEvent('academy:tilda:course-loading', {
      detail: { request: request }
    }));

    try {
      var response = await fetchCourse(request.url);
      var payload = response ? response.payload : null;
      var course = payload && payload.data ? payload.data : null;

      if (response && response.status === 404) {
        renderCourse(root, null, request);
        return;
      }

      if (!response || !response.ok) {
        var message = payload && payload.error
          ? payload.error
          : ('HTTP ' + (response ? response.status : '0'));
        throw new Error(message);
      }

      renderCourse(root, course, request);
    } catch (error) {
      clearCourse(root);
      root.setAttribute('data-course-state', 'error');
      root.dispatchEvent(new CustomEvent('academy:tilda:course-error', {
        detail: { error: error, request: request }
      }));
      console.error('Failed to load Tilda course fields', error);
    }
  }

  function findClosestRoot(node) {
    var current = node;

    while (current && current.nodeType === 1) {
      if (current.matches && current.matches(ROOT_SELECTOR)) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function init(context) {
    var scope = context && context.querySelectorAll ? context : document;
    var roots = scope.querySelectorAll(ROOT_SELECTOR);
    if (!roots.length) return;

    roots.forEach(function (root) {
      loadCourse(root);
    });
  }

  function observe() {
    if (typeof MutationObserver !== 'function') return;
    if (window.__academyTildaCourseObserverBound === true) return;

    window.__academyTildaCourseObserverBound = true;
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches(ROOT_SELECTOR)) {
            loadCourse(node);
            return;
          }
          var closestRoot = findClosestRoot(node);
          if (closestRoot) {
            loadCourse(closestRoot);
          }
          if (node.querySelectorAll) {
            init(node);
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function boot() {
    init();
    observe();
  }

  if (typeof window.t_onReady === 'function') {
    window.t_onReady(function () {
      boot();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
    });
  } else {
    boot();
  }

  window.setTimeout(init, 600);
})();
