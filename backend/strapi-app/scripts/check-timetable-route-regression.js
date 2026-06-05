'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const createRootIndexMiddleware = require('../src/middlewares/root-index');

const createMockCtx = ({ method = 'GET', requestPath = '/' }) => {
  return {
    method,
    path: requestPath,
    type: '',
    status: 404,
    body: undefined,
    redirectUrl: '',
    redirect(url) {
      this.status = 302;
      this.redirectUrl = url;
    },
  };
};

const runRequest = async (middleware, ctxInput) => {
  const ctx = createMockCtx(ctxInput);
  let nextCalled = false;

  await middleware(ctx, async () => {
    nextCalled = true;
  });

  return { ctx, nextCalled };
};

const readStream = async (stream) => {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
};

const main = async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-timetable-route-'));
  const publicDir = path.join(tempDir, 'public');
  const indexPath = path.join(publicDir, 'index.html');
  const coursePagePath = path.join(publicDir, 'course-page.html');

  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(indexPath, '<h1>Расписание обучения и мероприятий в Академии</h1>');
  fs.writeFileSync(coursePagePath, '<h1>Страница курса</h1>');

  try {
    const middleware = createRootIndexMiddleware({}, {
      strapi: {
        dirs: {
          static: {
            public: publicDir,
          },
        },
      },
    });

    const rootGet = await runRequest(middleware, {
      requestPath: '/',
    });
    assert.equal(rootGet.nextCalled, false);
    assert.equal(rootGet.ctx.status, 302);
    assert.equal(rootGet.ctx.redirectUrl, '/timetable');
    assert.equal(rootGet.ctx.body, undefined);

    const timetableGet = await runRequest(middleware, {
      requestPath: '/timetable',
    });
    assert.equal(timetableGet.nextCalled, false);
    assert.equal(timetableGet.ctx.type, 'text/html; charset=utf-8');
    assert.equal(await readStream(timetableGet.ctx.body), '<h1>Расписание обучения и мероприятий в Академии</h1>');

    const timetableSlashGet = await runRequest(middleware, {
      requestPath: '/timetable/',
    });
    assert.equal(timetableSlashGet.nextCalled, false);
    assert.equal(timetableSlashGet.ctx.status, 302);
    assert.equal(timetableSlashGet.ctx.redirectUrl, '/timetable');
    assert.equal(timetableSlashGet.ctx.body, undefined);

    const timetableHead = await runRequest(middleware, {
      method: 'HEAD',
      requestPath: '/timetable',
    });
    assert.equal(timetableHead.nextCalled, false);
    assert.equal(timetableHead.ctx.status, 200);
    assert.equal(timetableHead.ctx.type, 'text/html; charset=utf-8');
    assert.equal(timetableHead.ctx.body, undefined);

    const unknownGet = await runRequest(middleware, {
      requestPath: '/unknown',
    });
    assert.equal(unknownGet.nextCalled, false);
    assert.equal(unknownGet.ctx.status, 302);
    assert.equal(unknownGet.ctx.redirectUrl, '/timetable');
    assert.equal(unknownGet.ctx.body, undefined);

    const nestedPageGet = await runRequest(middleware, {
      requestPath: '/courses/acting',
    });
    assert.equal(nestedPageGet.nextCalled, false);
    assert.equal(nestedPageGet.ctx.type, 'text/html; charset=utf-8');
    assert.equal(await readStream(nestedPageGet.ctx.body), '<h1>Страница курса</h1>');

    const previewCourseGet = await runRequest(middleware, {
      requestPath: '/preview/courses/acting',
    });
    assert.equal(previewCourseGet.nextCalled, false);
    assert.equal(previewCourseGet.ctx.type, 'text/html; charset=utf-8');
    assert.equal(await readStream(previewCourseGet.ctx.body), '<h1>Страница курса</h1>');

    const courseHead = await runRequest(middleware, {
      method: 'HEAD',
      requestPath: '/courses/acting',
    });
    assert.equal(courseHead.nextCalled, false);
    assert.equal(courseHead.ctx.status, 200);
    assert.equal(courseHead.ctx.type, 'text/html; charset=utf-8');
    assert.equal(courseHead.ctx.body, undefined);

    const adminGet = await runRequest(middleware, {
      requestPath: '/admin',
    });
    assert.equal(adminGet.nextCalled, true);
    assert.equal(adminGet.ctx.redirectUrl, '');

    const adminNestedGet = await runRequest(middleware, {
      requestPath: '/admin/content-manager',
    });
    assert.equal(adminNestedGet.nextCalled, true);
    assert.equal(adminNestedGet.ctx.redirectUrl, '');

    const contentManagerGet = await runRequest(middleware, {
      requestPath: '/content-manager/init',
    });
    assert.equal(contentManagerGet.nextCalled, true);
    assert.equal(contentManagerGet.ctx.redirectUrl, '');

    const contentTypeBuilderGet = await runRequest(middleware, {
      requestPath: '/content-type-builder/content-types',
    });
    assert.equal(contentTypeBuilderGet.nextCalled, true);
    assert.equal(contentTypeBuilderGet.ctx.redirectUrl, '');

    const uploadPluginGet = await runRequest(middleware, {
      requestPath: '/upload/files',
    });
    assert.equal(uploadPluginGet.nextCalled, true);
    assert.equal(uploadPluginGet.ctx.redirectUrl, '');

    const apiGet = await runRequest(middleware, {
      requestPath: '/api/courses-feed',
    });
    assert.equal(apiGet.nextCalled, true);
    assert.equal(apiGet.ctx.redirectUrl, '');

    const assetGet = await runRequest(middleware, {
      requestPath: '/assets/tilda-course-fields.js',
    });
    assert.equal(assetGet.nextCalled, true);
    assert.equal(assetGet.ctx.redirectUrl, '');

    const scheduleScriptGet = await runRequest(middleware, {
      requestPath: '/frontend-db.js',
    });
    assert.equal(scheduleScriptGet.nextCalled, true);
    assert.equal(scheduleScriptGet.ctx.redirectUrl, '');

    console.log('timetable route regression check passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
