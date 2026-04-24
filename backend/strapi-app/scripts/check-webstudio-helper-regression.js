'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HELPER_PATH = path.resolve(__dirname, '..', '..', '..', 'assets', 'webstudio-course-fields.js');
const HELPER_SOURCE = fs.readFileSync(HELPER_PATH, 'utf8');
const SINGLE_ROOT_SELECTOR = '.js-webstudio-course-fields, [data-webstudio-course]';
const LIST_ROOT_SELECTOR = '.js-webstudio-course-list, [data-webstudio-course-list]';
const ROOT_SELECTOR = SINGLE_ROOT_SELECTOR + ', ' + LIST_ROOT_SELECTOR;

const flushMicrotasks = async (count = 4) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const matchesSelector = (attributeMap, selector) => {
  if (selector === SINGLE_ROOT_SELECTOR) {
    return attributeMap.has('data-webstudio-course')
      || String(attributeMap.get('class') || '').indexOf('js-webstudio-course-fields') !== -1;
  }

  if (selector === LIST_ROOT_SELECTOR) {
    return attributeMap.has('data-webstudio-course-list')
      || String(attributeMap.get('class') || '').indexOf('js-webstudio-course-list') !== -1;
  }

  if (selector === ROOT_SELECTOR) {
    return matchesSelector(attributeMap, SINGLE_ROOT_SELECTOR) || matchesSelector(attributeMap, LIST_ROOT_SELECTOR);
  }

  if (selector === '[data-course-field]') return attributeMap.has('data-course-field');
  if (selector === '[data-course-request-field]') return attributeMap.has('data-course-request-field');
  if (selector === '[data-course-list-template]') return attributeMap.has('data-course-list-template');
  if (selector === '[data-course-list-items]') return attributeMap.has('data-course-list-items');
  if (selector === 'script[src]') return attributeMap.has('src');

  return false;
};

const createNode = (attributes = {}, children = []) => {
  const attributeMap = new Map(Object.entries(attributes));

  const node = {
    nodeType: 1,
    hidden: false,
    textContent: '',
    parentElement: null,
    childNodes: [],
    getAttribute(name) {
      return attributeMap.has(name) ? attributeMap.get(name) : null;
    },
    setAttribute(name, value) {
      attributeMap.set(name, String(value));
    },
    removeAttribute(name) {
      attributeMap.delete(name);
    },
    appendChild(child) {
      if (!child) return child;
      child.parentElement = node;
      node.childNodes.push(child);
      return child;
    },
    removeChild(child) {
      const index = node.childNodes.indexOf(child);
      if (index >= 0) {
        node.childNodes.splice(index, 1);
        child.parentElement = null;
      }
      return child;
    },
    matches(selector) {
      return matchesSelector(attributeMap, selector);
    },
    querySelectorAll(selector) {
      const results = [];

      const visit = (current) => {
        current.childNodes.forEach((child) => {
          if (child.matches && child.matches(selector)) {
            results.push(child);
          }
          visit(child);
        });
      };

      visit(node);
      return results;
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] || null;
    },
    cloneNode(deep) {
      const clone = createNode(Object.fromEntries(attributeMap.entries()));
      clone.hidden = node.hidden;
      clone.textContent = node.textContent;

      if (deep) {
        node.childNodes.forEach((child) => {
          clone.appendChild(child.cloneNode(true));
        });
      }

      return clone;
    },
    _attributes: attributeMap,
  };

  children.forEach((child) => node.appendChild(child));
  return node;
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
      src: 'https://academy.example.com/assets/webstudio-course-fields.js',
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
    __academyWebstudioCourseObserverBound: false,
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

const createSingleRoot = (attributes = {}, fieldNodes = []) => {
  const root = createNode({
    class: 'js-webstudio-course-fields',
    ...attributes,
  }, fieldNodes);
  const dispatchedEvents = [];
  root.dispatchEvent = (event) => {
    dispatchedEvents.push(event);
    return true;
  };
  root._fieldNodes = fieldNodes;
  root._events = dispatchedEvents;
  return root;
};

const createListRoot = (attributes = {}, templateFields = []) => {
  const container = createNode({ 'data-course-list-items': 'true' });
  const template = createNode({ 'data-course-list-template': 'true' }, templateFields);
  const root = createNode({
    class: 'js-webstudio-course-list',
    ...attributes,
  }, [template, container]);
  const dispatchedEvents = [];
  root.dispatchEvent = (event) => {
    dispatchedEvents.push(event);
    return true;
  };
  root._template = template;
  root._container = container;
  root._events = dispatchedEvents;
  return root;
};

const testSingleBySlug = async () => {
  const titleNode = createNode({ 'data-course-field': 'title' });
  const linkNode = createNode({
    'data-course-field': 'courseLink',
    'data-course-attr': 'href',
  });
  const root = createSingleRoot({
    'data-course-slug': 'acting-course',
    'data-course-fields-extra': 'title,courseLink',
  }, [titleNode, linkNode]);
  const fetchCalls = [];
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(200, {
        ok: true,
        data: {
          title: 'Acting Course',
          courseLink: 'https://academy.example.com/acting-course',
        },
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].includes('/api/public/courses/acting-course'));
  assert.equal(root.getAttribute('data-course-state'), 'success');
  assert.equal(titleNode.textContent, 'Acting Course');
  assert.equal(linkNode.getAttribute('href'), 'https://academy.example.com/acting-course');
  assert.equal(root._events.filter((event) => event.type === 'academy:webstudio:course-data').length, 1);
};

const testSingleResolveByPathNotFound = async () => {
  const titleNode = createNode({ 'data-course-field': 'title' });
  const root = createSingleRoot({
    'data-course-path': '/resolved-by-path',
    'data-course-fields-extra': 'title',
  }, [titleNode]);
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
  assert.ok(fetchCalls[0].startsWith('https://academy.example.com/api/public/courses/resolve?'));
  assert.ok(fetchCalls[0].includes('path=%2Fresolved-by-path'));
  assert.equal(root.getAttribute('data-course-state'), 'not-found');
  assert.equal(titleNode.textContent, '');
  assert.equal(root._events.filter((event) => event.type === 'academy:webstudio:course-not-found').length, 1);
};

const testListRenderWithTemplate = async () => {
  const templateTitle = createNode({ 'data-course-field': 'title' });
  const templateLink = createNode({
    'data-course-field': 'courseLink',
    'data-course-attr': 'href',
  });
  const root = createListRoot({
    'data-filter-waitlist': 'true',
    'data-course-search': 'Speech',
    'data-course-fields-extra': 'title,courseLink',
  }, [templateTitle, templateLink]);
  const fetchCalls = [];
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(200, {
        ok: true,
        data: [
          {
            title: 'Speech Waitlist 1',
            courseLink: 'https://academy.example.com/speech-1',
          },
          {
            title: 'Speech Waitlist 2',
            courseLink: 'https://academy.example.com/speech-2',
          },
        ],
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].startsWith('https://academy.example.com/api/public/courses?'));
  assert.ok(fetchCalls[0].includes('waitlist=true'));
  assert.ok(fetchCalls[0].includes('search=Speech'));
  assert.equal(root.getAttribute('data-course-list-state'), 'success');
  assert.equal(root._container.childNodes.length, 2);
  assert.equal(root._container.childNodes[0].querySelectorAll('[data-course-field]')[0].textContent, 'Speech Waitlist 1');
  assert.equal(
    root._container.childNodes[1].querySelectorAll('[data-course-field]')[1].getAttribute('href'),
    'https://academy.example.com/speech-2'
  );
  assert.equal(root._events.filter((event) => event.type === 'academy:webstudio:courses-data').length, 1);
};

const testListEmptyState = async () => {
  const root = createListRoot({
    'data-course-fields-extra': 'title',
  }, [createNode({ 'data-course-field': 'title' })]);
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async () => {
      return createJsonResponse(200, {
        ok: true,
        data: [],
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(root.getAttribute('data-course-list-state'), 'empty');
  assert.equal(root._container.childNodes.length, 0);
  assert.equal(root._events.filter((event) => event.type === 'academy:webstudio:courses-empty').length, 1);
};

const testListErrorState = async () => {
  const root = createListRoot({
    'data-course-fields-extra': 'title',
  }, [createNode({ 'data-course-field': 'title' })]);
  const env = createEnvironment({
    roots: [root],
    fetchImpl: async () => {
      return createJsonResponse(500, {
        ok: false,
        error: 'Temporary error.',
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.equal(root.getAttribute('data-course-list-state'), 'error');
  assert.equal(root._events.filter((event) => event.type === 'academy:webstudio:courses-error').length, 1);
};

const main = async () => {
  await testSingleBySlug();
  await testSingleResolveByPathNotFound();
  await testListRenderWithTemplate();
  await testListEmptyState();
  await testListErrorState();
  console.log('webstudio helper regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
