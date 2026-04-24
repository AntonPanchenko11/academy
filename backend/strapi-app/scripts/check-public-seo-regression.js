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
  process.env.SEO_STATIC_PATHS = '/about,/contacts\n/programs';

  const middleware = createPublicApiMiddleware({
    strapi: {
      log: {
        error() {},
      },
    },
    loadSerializedCourses: async () => ([
      {
        publish: true,
        coursePath: '/courses/acting',
      },
      {
        publish: true,
        coursePath: '/courses/speech',
      },
      {
        publish: false,
        coursePath: '/courses/hidden',
      },
    ]),
    checkDatabaseHealth: async () => ({ ready: true }),
  });

  const robotsGet = await runRequest(middleware, {
    path: '/robots.txt',
  });
  assert.equal(robotsGet.status, 200);
  assert.equal(robotsGet.response.type, 'text/plain; charset=utf-8');
  assert.equal(
    robotsGet.body,
    'User-agent: *\nAllow: /\nSitemap: https://academy.example.com/sitemap.xml\n'
  );

  const robotsHead = await runRequest(middleware, {
    method: 'HEAD',
    path: '/robots.txt',
  });
  assert.equal(robotsHead.status, 200);
  assert.equal(robotsHead.body, undefined);

  const sitemapGet = await runRequest(middleware, {
    path: '/sitemap.xml',
  });
  assert.equal(sitemapGet.status, 200);
  assert.equal(sitemapGet.response.type, 'application/xml; charset=utf-8');
  assert.ok(sitemapGet.body.includes('<loc>https://academy.example.com</loc>'));
  assert.ok(sitemapGet.body.includes('<loc>https://academy.example.com/about</loc>'));
  assert.ok(sitemapGet.body.includes('<loc>https://academy.example.com/contacts</loc>'));
  assert.ok(sitemapGet.body.includes('<loc>https://academy.example.com/programs</loc>'));
  assert.ok(sitemapGet.body.includes('<loc>https://academy.example.com/courses/acting</loc>'));
  assert.ok(sitemapGet.body.includes('<loc>https://academy.example.com/courses/speech</loc>'));
  assert.ok(!sitemapGet.body.includes('/courses/hidden'));

  const sitemapHead = await runRequest(middleware, {
    method: 'HEAD',
    path: '/sitemap.xml',
  });
  assert.equal(sitemapHead.status, 200);
  assert.equal(sitemapHead.body, undefined);

  console.log('public seo regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
