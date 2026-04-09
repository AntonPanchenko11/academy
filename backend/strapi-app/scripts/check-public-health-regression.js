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
  let nextCalled = false;

  await middleware(ctx, async () => {
    nextCalled = true;
  });

  return { ctx, nextCalled };
};

const createMiddleware = (databaseReady) => {
  return createPublicApiMiddleware({
    strapi: {
      log: {
        error() {},
      },
    },
    loadSerializedCourses: async () => [],
    checkDatabaseHealth: async () => ({ ready: databaseReady }),
  });
};

const main = async () => {
  const healthyMiddleware = createMiddleware(true);
  const degradedMiddleware = createMiddleware(false);

  const liveGet = await runRequest(healthyMiddleware, {
    path: '/api/health/live',
  });
  assert.equal(liveGet.ctx.status, 200);
  assert.deepEqual(liveGet.ctx.body, {
    ok: true,
    service: 'academy-strapi',
    status: 'live',
  });
  assert.equal(liveGet.nextCalled, false);

  const liveHead = await runRequest(healthyMiddleware, {
    method: 'HEAD',
    path: '/api/health/live',
  });
  assert.equal(liveHead.ctx.status, 200);
  assert.equal(liveHead.ctx.body, undefined);

  const readyGet = await runRequest(healthyMiddleware, {
    path: '/api/health/ready',
  });
  assert.equal(readyGet.ctx.status, 200);
  assert.deepEqual(readyGet.ctx.body, {
    ok: true,
    service: 'academy-strapi',
    status: 'ready',
    checks: {
      database: { ready: true },
    },
  });

  const readyDegraded = await runRequest(degradedMiddleware, {
    path: '/api/health/ready',
  });
  assert.equal(readyDegraded.ctx.status, 503);
  assert.deepEqual(readyDegraded.ctx.body, {
    ok: false,
    service: 'academy-strapi',
    status: 'degraded',
    checks: {
      database: { ready: false },
    },
  });

  const tildaHealthDegradedHead = await runRequest(degradedMiddleware, {
    method: 'HEAD',
    path: '/api/tilda/health',
  });
  assert.equal(tildaHealthDegradedHead.ctx.status, 503);
  assert.equal(tildaHealthDegradedHead.ctx.body, undefined);

  const tildaHealthHealthy = await runRequest(healthyMiddleware, {
    path: '/api/tilda/health',
  });
  assert.equal(tildaHealthHealthy.ctx.status, 200);
  assert.deepEqual(tildaHealthHealthy.ctx.body, {
    ok: true,
    service: 'tilda-courses',
    checks: {
      database: { ready: true },
    },
  });

  const passthrough = await runRequest(healthyMiddleware, {
    path: '/api/unknown',
  });
  assert.equal(passthrough.nextCalled, true);
  assert.equal(passthrough.ctx.status, 404);
  assert.equal(passthrough.ctx.body, undefined);

  console.log('public health regression check passed');
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
