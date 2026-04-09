'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HELPER_PATH = path.resolve(__dirname, '..', '..', '..', 'assets', 'tilda-course-fields.js');
const HELPER_SOURCE = fs.readFileSync(HELPER_PATH, 'utf8');
const ROOT_SELECTOR = '.js-tilda-course-fields, [data-tilda-course]';

const flushMicrotasks = async (count = 4) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const createNode = (attributes = {}) => {
  const attributeMap = new Map(Object.entries(attributes));

  return {
    nodeType: 1,
    hidden: false,
    textContent: '',
    parentElement: null,
    getAttribute(name) {
      return attributeMap.has(name) ? attributeMap.get(name) : null;
    },
    setAttribute(name, value) {
      attributeMap.set(name, String(value));
    },
    removeAttribute(name) {
      attributeMap.delete(name);
    },
    matches(selector) {
      if (selector === ROOT_SELECTOR) {
        return attributeMap.has('data-tilda-course')
          || String(attributeMap.get('class') || '').indexOf('js-tilda-course-fields') !== -1;
      }

      return false;
    },
    querySelectorAll() {
      return [];
    },
    _attributes: attributeMap,
  };
};

const createRoot = (attributes = {}, fieldNames = ['title']) => {
  const root = createNode({
    class: 'js-tilda-course-fields',
    ...attributes,
  });

  const fieldNodes = fieldNames.map((fieldName) => {
    const fieldNode = createNode({
      'data-course-field': fieldName,
    });
    fieldNode.parentElement = root;
    return fieldNode;
  });

  const dispatchedEvents = [];
  root.querySelectorAll = (selector) => {
    if (selector === '[data-course-field]') return fieldNodes;
    if (selector === '[data-course-request-field]') return [];
    return [];
  };
  root.dispatchEvent = (event) => {
    dispatchedEvents.push(event);
    return true;
  };
  root._fieldNodes = fieldNodes;
  root._events = dispatchedEvents;

  return root;
};

const createObserverFactory = () => {
  const observers = [];

  function MutationObserver(callback) {
    this.callback = callback;
    this.observe = () => {};
    observers.push(this);
  }

  MutationObserver.triggerAddedNode = (node) => {
    observers.forEach((observer) => {
      observer.callback([
        {
          addedNodes: [node],
        },
      ]);
    });
  };

  return MutationObserver;
};

const createEnvironment = ({ roots, fetchImpl }) => {
  let domReadyHandler = null;
  const MutationObserver = createObserverFactory();
  const bodyNode = createNode();
  const htmlNode = createNode();
  const timeoutCalls = [];

  const document = {
    readyState: 'loading',
    currentScript: {
      src: 'https://academy.example.com/assets/tilda-course-fields.js',
    },
    body: bodyNode,
    documentElement: htmlNode,
    querySelectorAll(selector) {
      if (selector === ROOT_SELECTOR) return roots;
      if (selector === 'script[src]') return [];
      return [];
    },
    querySelector() {
      return null;
    },
    addEventListener(eventName, handler) {
      if (eventName === 'DOMContentLoaded') {
        domReadyHandler = handler;
      }
    },
  };

  const window = {
    location: {
      href: 'https://academy.example.com/current-page',
      origin: 'https://academy.example.com',
      pathname: '/current-page',
    },
    document,
    __academyTildaCourseObserverBound: false,
    setTimeout(handler, delay) {
      timeoutCalls.push({ handler, delay });
      return 0;
    },
    clearTimeout() {},
  };

  const context = vm.createContext({
    window,
    document,
    fetch: fetchImpl,
    console: {
      log() {},
      info() {},
      warn() {},
      error() {},
    },
    URL,
    URLSearchParams,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    Promise,
    MutationObserver,
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options && options.detail ? options.detail : null;
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });

  window.window = window;
  window.CustomEvent = context.CustomEvent;
  window.MutationObserver = MutationObserver;

  return {
    context,
    timeoutCalls,
    runScript() {
      vm.runInContext(HELPER_SOURCE, context, { filename: HELPER_PATH });
    },
    triggerDomReady() {
      assert.equal(typeof domReadyHandler, 'function', 'Expected DOMContentLoaded handler to be registered');
      domReadyHandler();
    },
    triggerAddedNode(node) {
      MutationObserver.triggerAddedNode(node);
    },
  };
};

const createJsonResponse = (status, payload) => {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
};

const testNotFoundState = async () => {
  const root = createRoot({
    'data-course-slug': 'missing-course',
    'data-course-fields-extra': 'title',
  });
  const fetchCalls = [];
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(404, {
        ok: false,
        error: 'Course not found.',
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.equal(root.getAttribute('data-course-state'), 'not-found');
  assert.equal(root._fieldNodes[0].textContent, '');
  assert.equal(root._events.filter((event) => event.type === 'academy:tilda:course-not-found').length, 1);
  assert.equal(root._events.filter((event) => event.type === 'academy:tilda:course-error').length, 0);

  env.triggerAddedNode(root);
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.equal(root._events.filter((event) => event.type === 'academy:tilda:course-not-found').length, 1);
};

const testRetryAfterFailedRequest = async () => {
  const root = createRoot({
    'data-course-slug': 'retry-course',
    'data-course-fields-extra': 'title',
  });
  const responses = [
    createJsonResponse(500, {
      ok: false,
      error: 'Temporary error.',
    }),
    createJsonResponse(200, {
      ok: true,
      data: {
        title: 'Retry Course',
      },
    }),
  ];
  const fetchCalls = [];
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return responses.shift() || createJsonResponse(200, { ok: true, data: { title: 'Retry Course' } });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(root.getAttribute('data-course-state'), 'error');
  assert.equal(fetchCalls.length, 1);
  assert.equal(root._events.filter((event) => event.type === 'academy:tilda:course-error').length, 1);

  env.triggerAddedNode(root);
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 2);
  assert.equal(root.getAttribute('data-course-state'), 'success');
  assert.equal(root._fieldNodes[0].textContent, 'Retry Course');
  assert.equal(root._events.filter((event) => event.type === 'academy:tilda:course-data').length, 1);
};

const testRerenderForNodesAddedInsideLoadedRoot = async () => {
  const root = createRoot({
    'data-course-slug': 'cached-course',
    'data-course-fields-extra': 'title',
  });
  const fetchCalls = [];
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(200, {
        ok: true,
        data: {
          title: 'Cached Course',
        },
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.equal(root.getAttribute('data-course-state'), 'success');
  assert.equal(root._fieldNodes[0].textContent, 'Cached Course');

  const dynamicField = createNode({
    'data-course-field': 'title',
  });
  dynamicField.parentElement = root;
  root._fieldNodes.push(dynamicField);

  env.triggerAddedNode(dynamicField);
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.equal(dynamicField.textContent, 'Cached Course');
  assert.equal(root._events.filter((event) => event.type === 'academy:tilda:course-data').length, 1);
};

const testIdentifierPriorityAndSingleDeferredInit = async () => {
  const root = createRoot({
    'data-course-id': '12',
    'data-course-document-id': 'doc-12',
    'data-course-slug': 'slug-12',
    'data-course-url': 'https://academy.example.com/from-url',
    'data-course-path': '/from-path',
    'data-course-title': 'From Title',
    'data-course-fields-extra': 'title',
  });
  const fetchCalls = [];
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(200, {
        ok: true,
        data: {
          title: 'Priority Course',
        },
      });
    },
  });

  env.runScript();
  assert.equal(env.timeoutCalls.length, 1);
  assert.equal(env.timeoutCalls[0].delay, 600);

  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].includes('/api/tilda/courses/12'));
  assert.ok(!fetchCalls[0].includes('/api/tilda/courses/resolve?'));
};

const testResolveRequestByPathWithoutExplicitIdentifiers = async () => {
  const root = createRoot({
    'data-course-path': '/resolved-by-path',
    'data-course-fields-extra': 'title',
  });
  const fetchCalls = [];
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(200, {
        ok: true,
        data: {
          title: 'Resolved By Path',
        },
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].startsWith('https://academy.example.com/api/tilda/courses/resolve?'));
  assert.ok(fetchCalls[0].includes('path=%2Fresolved-by-path'));
  assert.ok(!fetchCalls[0].includes('title='));
};

const main = async () => {
  await testNotFoundState();
  await testRetryAfterFailedRequest();
  await testRerenderForNodesAddedInsideLoadedRoot();
  await testIdentifierPriorityAndSingleDeferredInit();
  await testResolveRequestByPathWithoutExplicitIdentifiers();
  console.log('tilda helper regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
