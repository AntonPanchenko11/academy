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
  const logEntries = [];
  process.env.PUBLIC_URL = 'https://academy.example.com';
  process.env.SEO_STATIC_PATHS = '/about';

  const middleware = createPublicApiMiddleware({
    strapi: {
      log: {
        error(message) {
          logEntries.push(message);
        },
      },
    },
    loadSerializedCourses: async () => {
      throw new Error('boom');
    },
    checkDatabaseHealth: async () => ({ ready: true }),
  });

  const publicListCtx = await runRequest(middleware, {
    path: '/api/public/courses',
  });
  assert.equal(publicListCtx.status, 500);

  const feedCtx = await runRequest(middleware, {
    path: '/api/courses-feed',
  });
  assert.equal(feedCtx.status, 500);

  const sitemapCtx = await runRequest(middleware, {
    path: '/sitemap.xml',
  });
  assert.equal(sitemapCtx.status, 500);

  assert.ok(logEntries.includes('[public-api:webstudio] Failed to load course list'));
  assert.ok(logEntries.includes('[public-api:schedule] Failed to load courses-feed'));
  assert.ok(logEntries.includes('[public-api:seo] Failed to build sitemap.xml'));

  console.log('public api logging regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
