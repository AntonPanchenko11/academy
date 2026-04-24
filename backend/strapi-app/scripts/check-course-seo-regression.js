'use strict';

const assert = require('node:assert/strict');

const { createPublicApiMiddleware } = require('../src/server/public-api-middleware');

const createMockCtx = ({ method = 'GET', path: requestPath, query = {} }) => {
  const ctx = {
    method,
    path: requestPath,
    query,
    response: { type: '' },
    set() {},
    _status: 404,
    _explicitStatus: false,
  };

  Object.defineProperty(ctx, 'status', {
    get() {
      return this._status;
    },
    set(value) {
      this._status = value;
      this._explicitStatus = true;
    },
  });

  Object.defineProperty(ctx, 'body', {
    get() {
      return this._body;
    },
    set(value) {
      this._body = value;
      if (!this._explicitStatus && this._status === 404) {
        this._status = 200;
      }
    },
  });

  return ctx;
};

const runRequest = async (middleware, ctxInput) => {
  const ctx = createMockCtx(ctxInput);
  await middleware(ctx, async () => {});
  return ctx;
};

const main = async () => {
  process.env.PUBLIC_URL = 'https://academy.example.com';
  process.env.SEO_SITE_NAME = 'Academy';
  process.env.SEO_TITLE_SUFFIX = '| Academy';
  process.env.SEO_DEFAULT_DESCRIPTION = 'Обучение и мероприятия Академии';

  const middleware = createPublicApiMiddleware({
    strapi: {
      log: {
        error() {},
      },
    },
    loadSerializedCourses: async () => ([
      {
        slug: 'acting-course',
        title: 'Актерское мастерство',
        comment: '',
        publish: true,
        day: '15',
        monthLabel: 'Июня',
        studyDays: 'пн-ср',
        hoursLabel: '24 ак. ч.',
        price: 18000,
        coursePath: '/courses/acting-course',
        heroImg: 'https://academy.example.com/uploads/acting-hero.jpg',
        catalogImg: 'https://academy.example.com/uploads/acting-card.jpg',
      },
      {
        slug: 'hidden-course',
        title: 'Скрытый курс',
        publish: false,
        coursePath: '/courses/hidden-course',
      },
    ]),
    checkDatabaseHealth: async () => ({ ready: true }),
  });

  const singleSeoCtx = await runRequest(middleware, {
    path: '/api/public/seo/courses/acting-course',
  });
  assert.equal(singleSeoCtx.status, 200);
  assert.deepEqual(singleSeoCtx.body.data, {
    title: 'Актерское мастерство | Academy',
    description: 'Курс «Актерское мастерство». Старт 15 июня. Занятия пн-ср. 24 ак. ч. Стоимость 18 000 ₽',
    canonicalUrl: 'https://academy.example.com/courses/acting-course',
    robots: 'index,follow',
    openGraph: {
      type: 'website',
      url: 'https://academy.example.com/courses/acting-course',
      title: 'Актерское мастерство | Academy',
      description: 'Курс «Актерское мастерство». Старт 15 июня. Занятия пн-ср. 24 ак. ч. Стоимость 18 000 ₽',
      image: 'https://academy.example.com/uploads/acting-hero.jpg',
      siteName: 'Academy',
    },
  });

  const resolveSeoCtx = await runRequest(middleware, {
    path: '/api/public/seo/courses/resolve',
    query: { path: '/courses/acting-course' },
  });
  assert.equal(resolveSeoCtx.status, 200);
  assert.equal(
    resolveSeoCtx.body.data.canonicalUrl,
    'https://academy.example.com/courses/acting-course'
  );

  const missingSeoCtx = await runRequest(middleware, {
    path: '/api/public/seo/courses/missing-course',
  });
  assert.equal(missingSeoCtx.status, 404);

  const hiddenSeoCtx = await runRequest(middleware, {
    path: '/api/public/seo/courses/hidden-course',
  });
  assert.equal(hiddenSeoCtx.status, 404);

  const headCtx = await runRequest(middleware, {
    method: 'HEAD',
    path: '/api/public/seo/courses/acting-course',
  });
  assert.equal(headCtx.status, 200);
  assert.equal(headCtx.body, undefined);

  console.log('course seo regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
