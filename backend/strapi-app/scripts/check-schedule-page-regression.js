'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND_PATH = path.resolve(__dirname, '..', '..', '..', 'frontend-db.js');
const FRONTEND_SOURCE = fs.readFileSync(FRONTEND_PATH, 'utf8');

const flushMicrotasks = async (count = 4) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const createElement = () => ({
  innerHTML: '',
});

const createEnvironment = ({ fetchImpl }) => {
  const elements = {
    monthTabs: createElement(),
    monthsContainer: createElement(),
    waitlistContainer: createElement(),
  };
  let domReadyHandler = null;

  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener(eventName, handler) {
      if (eventName === 'DOMContentLoaded') {
        domReadyHandler = handler;
      }
    },
  };

  const context = vm.createContext({
    document,
    fetch: fetchImpl,
    console: {
      log() {},
      info() {},
      warn() {},
      error() {},
    },
    Date,
    Map,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
  });

  return {
    elements,
    runScript() {
      vm.runInContext(FRONTEND_SOURCE, context, { filename: FRONTEND_PATH });
    },
    triggerDomReady() {
      assert.equal(typeof domReadyHandler, 'function', 'Expected DOMContentLoaded handler to be registered');
      domReadyHandler();
    },
  };
};

const createJsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const testSuccessfulRender = async () => {
  const fetchCalls = [];
  const env = createEnvironment({
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(200, {
        data: [
          {
            id: 1,
            title: 'Курс Весна',
            comment: 'Очный формат',
            date: '2026-05-14',
            day: '14',
            dateLabel: 'Мая, чт',
            waitlist: false,
            courseStatus: 'Идет набор',
            studyDays: 'чт-пт',
            hours: 24,
            hoursLabel: '24 ак. ч.',
            price: 1700,
            educationDocument: 'Сертификат',
            courseLink: 'https://academy.example.com/course-spring',
          },
          {
            id: 2,
            title: 'Курс Лист ожидания',
            comment: 'Онлайн',
            date: '',
            day: '',
            dateLabel: '',
            waitlist: true,
            courseStatus: 'Идет набор',
            studyDays: '',
            hours: null,
            hoursLabel: '',
            price: 2200,
            educationDocument: '',
            courseLink: 'https://academy.example.com/course-wait',
          },
        ],
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.deepEqual(fetchCalls, ['/api/courses-feed']);
  assert.ok(env.elements.monthTabs.innerHTML.includes('Май'));
  assert.ok(env.elements.monthsContainer.innerHTML.includes('Курс Весна'));
  assert.ok(env.elements.monthsContainer.innerHTML.includes('Очный формат'));
  assert.ok(env.elements.monthsContainer.innerHTML.includes('1700'));
  assert.ok(env.elements.monthsContainer.innerHTML.includes('24 ак. ч.'));
  assert.ok(env.elements.waitlistContainer.innerHTML.includes('Курс Лист ожидания'));
};

const testErrorRender = async () => {
  const fetchCalls = [];
  const env = createEnvironment({
    fetchImpl: async (requestUrl) => {
      fetchCalls.push(requestUrl);
      return createJsonResponse(503, {
        error: 'Failed to load courses feed',
      });
    },
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.deepEqual(fetchCalls, ['/api/courses-feed']);
  assert.ok(env.elements.monthsContainer.innerHTML.includes('Не удалось загрузить курсы из БД.'));
  assert.equal(env.elements.waitlistContainer.innerHTML, '');
  assert.equal(env.elements.monthTabs.innerHTML, '');
};

const testNoLegacyDerivedFieldFallbacks = async () => {
  const env = createEnvironment({
    fetchImpl: async () => createJsonResponse(200, {
      data: [
        {
          id: 3,
          title: 'Курс Без Derived Fallback',
          comment: '',
          date: '2026-06-18',
          day: '',
          dateLabel: 'Июня, чт',
          waitlist: false,
          courseStatus: 'Идет набор',
          studyDays: '',
          hoursLabel: '',
          hours: 36,
          price: 2500,
          educationDocument: '',
          courseLink: 'https://academy.example.com/course-no-fallback',
        },
      ],
    }),
  });

  env.runScript();
  env.triggerDomReady();
  await flushMicrotasks();

  assert.ok(env.elements.monthsContainer.innerHTML.includes('Курс Без Derived Fallback'));
  assert.ok(!env.elements.monthsContainer.innerHTML.includes('36 ак. ч.'));
  assert.ok(!env.elements.monthsContainer.innerHTML.includes('18</span>'));
};

const main = async () => {
  await testSuccessfulRender();
  await testErrorRender();
  await testNoLegacyDerivedFieldFallbacks();
  console.log('schedule page regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
