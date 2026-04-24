(function () {
  'use strict';

  var SINGLE_ROOT_SELECTOR = '.js-webstudio-course-fields, [data-webstudio-course]';
  var LIST_ROOT_SELECTOR = '.js-webstudio-course-list, [data-webstudio-course-list]';
  var ROOT_SELECTOR = SINGLE_ROOT_SELECTOR + ', ' + LIST_ROOT_SELECTOR;
  var REQUEST_CACHE = new Map();
  var SCRIPT_SRC = (function () {
    var current = document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : '';
    if (current) return current;

    var scripts = document.querySelectorAll('script[src]');
    for (var index = scripts.length - 1; index >= 0; index -= 1) {
      var src = scripts[index].src || scripts[index].getAttribute('src') || '';
      if (src.indexOf('/assets/webstudio-course-fields.js') !== -1) {
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
    return window.ACADEMY_WEBSTUDIO_COURSE && typeof window.ACADEMY_WEBSTUDIO_COURSE === 'object'
      ? window.ACADEMY_WEBSTUDIO_COURSE
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

  function getDefaultPagePath() {
    return normalizePathname(
      getMetaContent('link[rel="canonical"]')
      || getMetaContent('meta[property="og:url"]')
      || getMetaContent('meta[name="og:url"]')
      || window.location.pathname
    );
  }

  function getRequestedFields(scope, extraFieldsValue) {
    var renderFields = Array.prototype.slice.call(scope.querySelectorAll('[data-course-field]'))
      .map(function (node) {
        return toText(node.getAttribute('data-course-field')).split('.')[0];
      });
    var requestFields = Array.prototype.slice.call(scope.querySelectorAll('[data-course-request-field]'))
      .map(function (node) {
        return toText(node.getAttribute('data-course-request-field')).split('.')[0];
      });
    var extraFields = splitFields(extraFieldsValue)
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

  function fetchJson(requestUrl) {
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

  function isSingleRoot(node) {
    return Boolean(node && node.matches && node.matches(SINGLE_ROOT_SELECTOR));
  }

  function isListRoot(node) {
    return Boolean(node && node.matches && node.matches(LIST_ROOT_SELECTOR));
  }

  function buildSingleRequest(root) {
    var apiBase = normalizeBase(readConfigValue(root, 'data-api-base', 'apiBase'));
    var slug = readConfigValue(root, 'data-course-slug', 'slug');
    var coursePath = normalizePathname(readConfigValue(root, 'data-course-path', 'path') || getDefaultPagePath());
    var fields = getRequestedFields(root, root.getAttribute('data-course-fields-extra'));
    var params = new URLSearchParams();

    if (fields.length) {
      params.set('fields', fields.join(','));
    }

    if (slug) {
      return {
        url: apiBase + '/api/public/courses/' + encodeURIComponent(slug) + (params.toString() ? '?' + params.toString() : ''),
        identifier: slug,
      };
    }

    if (!coursePath) {
      return null;
    }

    params.set('path', coursePath);

    return {
      url: apiBase + '/api/public/courses/resolve?' + params.toString(),
      identifier: coursePath,
    };
  }

  function clearSingle(root) {
    var nodes = root.querySelectorAll('[data-course-field]');
    nodes.forEach(function (node) {
      applyNodeValue(node, '');
    });
  }

  function renderSingle(root, course, request, options) {
    var silent = Boolean(options && options.silent);

    if (!course) {
      clearSingle(root);
      root.__academyWebstudioCourseCache = null;
      root.setAttribute('data-course-state', 'not-found');
      if (!silent) {
        root.dispatchEvent(new CustomEvent('academy:webstudio:course-not-found', {
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

    root.__academyWebstudioCourseCache = {
      course: course,
      requestUrl: request && request.url ? request.url : ''
    };
    root.setAttribute('data-course-state', 'success');
    if (!silent) {
      root.dispatchEvent(new CustomEvent('academy:webstudio:course-data', {
        detail: { course: course, request: request || null }
      }));
    }
  }

  async function loadSingle(root) {
    if (!root) return;

    var request = buildSingleRequest(root);
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
      var cachedCourse = root.__academyWebstudioCourseCache && root.__academyWebstudioCourseCache.course
        ? root.__academyWebstudioCourseCache.course
        : null;
      if (cachedCourse) {
        renderSingle(root, cachedCourse, request, { silent: true });
      }
      return;
    }

    if (root.getAttribute('data-course-state') === 'not-found'
      && root.getAttribute('data-course-request-url') === request.url) {
      return;
    }

    root.setAttribute('data-course-request-url', request.url);
    root.setAttribute('data-course-state', 'loading');
    root.dispatchEvent(new CustomEvent('academy:webstudio:course-loading', {
      detail: { request: request }
    }));

    try {
      var response = await fetchJson(request.url);
      var payload = response ? response.payload : null;
      var course = payload && payload.data ? payload.data : null;

      if (response && response.status === 404) {
        renderSingle(root, null, request);
        return;
      }

      if (!response || !response.ok) {
        var message = payload && payload.error
          ? payload.error
          : ('HTTP ' + (response ? response.status : '0'));
        throw new Error(message);
      }

      renderSingle(root, course, request);
    } catch (error) {
      clearSingle(root);
      root.setAttribute('data-course-state', 'error');
      root.dispatchEvent(new CustomEvent('academy:webstudio:course-error', {
        detail: { error: error, request: request }
      }));
      console.error('Failed to load Webstudio course fields', error);
    }
  }

  function getListTemplate(root) {
    if (root.__academyWebstudioListTemplate) return root.__academyWebstudioListTemplate;

    var template = root.querySelector('[data-course-list-template]');
    if (template) {
      template.hidden = true;
      root.__academyWebstudioListTemplate = template;
    }
    return template;
  }

  function getListContainer(root) {
    return root.querySelector('[data-course-list-items]') || root;
  }

  function clearList(root) {
    var renderedNodes = root.__academyWebstudioListNodes || [];

    renderedNodes.forEach(function (node) {
      if (node && node.parentElement && typeof node.parentElement.removeChild === 'function') {
        node.parentElement.removeChild(node);
      }
    });

    root.__academyWebstudioListNodes = [];
  }

  function cloneTemplate(template) {
    if (!template || typeof template.cloneNode !== 'function') return null;

    var clone = template.cloneNode(true);
    if (!clone) return null;

    clone.hidden = false;
    if (typeof clone.removeAttribute === 'function') {
      clone.removeAttribute('data-course-list-template');
    }
    return clone;
  }

  function buildListRequest(root) {
    var apiBase = normalizeBase(readConfigValue(root, 'data-api-base', 'apiBase'));
    var waitlist = readConfigValue(root, 'data-filter-waitlist', 'waitlist')
      || readConfigValue(root, 'data-course-list-waitlist', 'waitlist');
    var search = readConfigValue(root, 'data-course-search', 'search')
      || readConfigValue(root, 'data-course-list-search', 'search');
    var fields = getRequestedFields(root, root.getAttribute('data-course-fields-extra'));
    var params = new URLSearchParams();

    if (fields.length) {
      params.set('fields', fields.join(','));
    }

    if (waitlist) {
      params.set('waitlist', waitlist);
    }

    if (search) {
      params.set('search', search);
    }

    return {
      url: apiBase + '/api/public/courses' + (params.toString() ? '?' + params.toString() : ''),
      identifier: waitlist || search || 'all',
    };
  }

  function renderList(root, courses, request, options) {
    var silent = Boolean(options && options.silent);
    var template = getListTemplate(root);
    var container = getListContainer(root);

    clearList(root);

    if (!template || !container) {
      var templateError = new Error('List template not found.');
      root.setAttribute('data-course-list-state', 'error');
      if (!silent) {
        root.dispatchEvent(new CustomEvent('academy:webstudio:courses-error', {
          detail: { error: templateError, request: request || null }
        }));
      }
      console.error('Failed to render Webstudio courses list', templateError);
      return;
    }

    if (!courses || !courses.length) {
      root.__academyWebstudioListCache = {
        courses: [],
        requestUrl: request && request.url ? request.url : ''
      };
      root.setAttribute('data-course-list-state', 'empty');
      if (!silent) {
        root.dispatchEvent(new CustomEvent('academy:webstudio:courses-empty', {
          detail: { courses: [], request: request || null }
        }));
      }
      return;
    }

    var renderedNodes = [];
    courses.forEach(function (course) {
      var itemNode = cloneTemplate(template);
      if (!itemNode) return;

      var nodes = itemNode.querySelectorAll('[data-course-field]');
      nodes.forEach(function (node) {
        var fieldPath = toText(node.getAttribute('data-course-field'));
        applyNodeValue(node, resolveFieldValue(course, fieldPath));
      });

      if (typeof container.appendChild === 'function') {
        container.appendChild(itemNode);
        renderedNodes.push(itemNode);
      }
    });

    root.__academyWebstudioListNodes = renderedNodes;
    root.__academyWebstudioListCache = {
      courses: courses,
      requestUrl: request && request.url ? request.url : ''
    };
    root.setAttribute('data-course-list-state', 'success');
    if (!silent) {
      root.dispatchEvent(new CustomEvent('academy:webstudio:courses-data', {
        detail: { courses: courses, request: request || null }
      }));
    }
  }

  async function loadList(root) {
    if (!root) return;

    var request = buildListRequest(root);
    if (!request || !request.url) {
      root.setAttribute('data-course-list-state', 'idle');
      return;
    }

    if (root.getAttribute('data-course-list-state') === 'loading'
      && root.getAttribute('data-course-list-request-url') === request.url) {
      return;
    }

    if ((root.getAttribute('data-course-list-state') === 'success'
        || root.getAttribute('data-course-list-state') === 'empty')
      && root.getAttribute('data-course-list-request-url') === request.url) {
      var cachedCourses = root.__academyWebstudioListCache && root.__academyWebstudioListCache.courses
        ? root.__academyWebstudioListCache.courses
        : [];
      renderList(root, cachedCourses, request, { silent: true });
      return;
    }

    root.setAttribute('data-course-list-request-url', request.url);
    root.setAttribute('data-course-list-state', 'loading');
    root.dispatchEvent(new CustomEvent('academy:webstudio:courses-loading', {
      detail: { request: request }
    }));

    try {
      var response = await fetchJson(request.url);
      var payload = response ? response.payload : null;
      var courses = payload && Array.isArray(payload.data) ? payload.data : [];

      if (!response || !response.ok) {
        var message = payload && payload.error
          ? payload.error
          : ('HTTP ' + (response ? response.status : '0'));
        throw new Error(message);
      }

      renderList(root, courses, request);
    } catch (error) {
      clearList(root);
      root.setAttribute('data-course-list-state', 'error');
      root.dispatchEvent(new CustomEvent('academy:webstudio:courses-error', {
        detail: { error: error, request: request }
      }));
      console.error('Failed to load Webstudio courses list', error);
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

  function loadRoot(root) {
    if (isSingleRoot(root)) {
      loadSingle(root);
      return;
    }

    if (isListRoot(root)) {
      loadList(root);
    }
  }

  function init(context) {
    var scope = context && context.querySelectorAll ? context : document;
    var roots = scope.querySelectorAll(ROOT_SELECTOR);
    if (!roots.length) return;

    roots.forEach(function (root) {
      loadRoot(root);
    });
  }

  function observe() {
    if (typeof MutationObserver !== 'function') return;
    if (window.__academyWebstudioCourseObserverBound === true) return;

    window.__academyWebstudioCourseObserverBound = true;
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches(ROOT_SELECTOR)) {
            loadRoot(node);
            return;
          }
          var closestRoot = findClosestRoot(node);
          if (closestRoot) {
            loadRoot(closestRoot);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
    });
  } else {
    boot();
  }

  window.setTimeout(init, 600);
})();
