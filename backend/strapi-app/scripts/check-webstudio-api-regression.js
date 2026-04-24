'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createStrapi } = require('@strapi/strapi');

const { serializeCourse } = require('../src/utils/tilda-course');
const { createPublicApiMiddleware } = require('../src/server/public-api-middleware');
const {
  APP_DIR,
  createTempDatabaseCopy,
  loadEnvFile,
} = require('./lib/strapi-script-helpers');

const COURSE_UID = 'api::course.course';

const createCourse = async (documents, suffix, params = {}) => {
  return documents.create({
    data: {
      title: params.title || `Webstudio Course ${suffix}`,
      publish: params.publish !== false,
      date: params.date || '2026-06-15',
      waitlist: params.waitlist === true,
      courseStatus: params.courseStatus || 'Идет набор',
      studyDays: params.studyDays || 'пн-ср',
      hours: params.hours === undefined ? 24 : params.hours,
      basePrice: params.basePrice === undefined ? 1000 : params.basePrice,
      educationDocument: params.educationDocument || 'Сертификат',
      courseLink: params.courseLink || `https://example.com/${params.slug || `webstudio-course-${suffix}`}`,
      catalogImg: params.catalogImg || null,
      heroImg: params.heroImg || null,
      slug: params.slug,
      comment: params.comment || null,
    },
  });
};

const loadSerializedCourses = async (strapi) => {
  const courses = await strapi.db.query(COURSE_UID).findMany({
    populate: {
      discount: true,
      priceChanges: true,
    },
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
  });

  return courses.map((course) => serializeCourse(course));
};

const checkDatabaseHealth = async () => ({ ready: true });

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
  loadEnvFile();

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-webstudio-api-');
  process.env.DATABASE_FILENAME = tempDbPath;
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '0';

  const strapi = createStrapi({
    appDir: APP_DIR,
    distDir: APP_DIR,
    autoReload: false,
    serveAdminPanel: false,
  });

  try {
    await strapi.load();

    const courseDocuments = strapi.documents(COURSE_UID);
    const suffix = String(Date.now());

    const publishedCourse = await createCourse(courseDocuments, suffix, {
      title: `Webstudio Published ${suffix}`,
      slug: `webstudio-published-${suffix}`,
      courseLink: `https://example.com/webstudio-published-${suffix}`,
      catalogImg: `https://static.tildacdn.com/webstudio-published-${suffix}.jpg`,
      heroImg: `https://static.tildacdn.com/webstudio-published-${suffix}-source.jpg`,
      comment: 'published comment',
      basePrice: 1400,
    });

    await createCourse(courseDocuments, `${suffix}-wait`, {
      title: `Webstudio Waitlist ${suffix}`,
      slug: `webstudio-waitlist-${suffix}`,
      courseLink: `https://example.com/webstudio-waitlist-${suffix}`,
      waitlist: true,
      basePrice: 2200,
    });

    await createCourse(courseDocuments, `${suffix}-unpub`, {
      title: `Webstudio Hidden ${suffix}`,
      slug: `webstudio-hidden-${suffix}`,
      courseLink: `https://example.com/webstudio-hidden-${suffix}`,
      publish: false,
      basePrice: 3300,
    });

    const middleware = createPublicApiMiddleware({
      strapi,
      loadSerializedCourses,
      checkDatabaseHealth,
    });

    const listCtx = await runRequest(middleware, {
      path: '/api/public/courses',
      query: { fields: 'title,price,dateLabel' },
    });
    assert.equal(listCtx.status, 200);
    assert.equal(listCtx.body.ok, true);
    assert.ok(Array.isArray(listCtx.body.data));
    assert.ok(listCtx.body.data.some((item) => item.title === `Webstudio Published ${suffix}`));
    assert.ok(listCtx.body.data.some((item) => item.title === `Webstudio Waitlist ${suffix}`));
    assert.ok(!listCtx.body.data.some((item) => item.title === `Webstudio Hidden ${suffix}`));
    assert.deepEqual(
      Object.keys(listCtx.body.data[0]).sort(),
      ['dateLabel', 'price', 'title']
    );

    const searchCtx = await runRequest(middleware, {
      path: '/api/public/courses',
      query: { search: `Published ${suffix}`, fields: 'title,slug' },
    });
    assert.deepEqual(searchCtx.body.data, [
      {
        title: `Webstudio Published ${suffix}`,
        slug: `webstudio-published-${suffix}`,
      },
    ]);

    const waitlistOnlyCtx = await runRequest(middleware, {
      path: '/api/public/courses',
      query: { waitlist: 'true', fields: 'title,waitlist' },
    });
    assert.deepEqual(waitlistOnlyCtx.body.data, [
      { title: `Webstudio Waitlist ${suffix}`, waitlist: true },
    ]);

    const includeUnpublishedCtx = await runRequest(middleware, {
      path: '/api/public/courses',
      query: { includeUnpublished: 'true', fields: 'title,slug' },
    });
    assert.ok(!includeUnpublishedCtx.body.data.some((item) => item.slug === `webstudio-hidden-${suffix}`));

    const singleBySlugCtx = await runRequest(middleware, {
      path: `/api/public/courses/${encodeURIComponent(`webstudio-published-${suffix}`)}`,
      query: { fields: 'title,price,catalogImg,heroImg,coursePath' },
    });
    assert.equal(singleBySlugCtx.body.ok, true);
    assert.deepEqual(singleBySlugCtx.body.data, {
      title: `Webstudio Published ${suffix}`,
      price: 1400,
      catalogImg: `https://static.tildacdn.com/webstudio-published-${suffix}.jpg`,
      heroImg: `https://static.tildacdn.com/webstudio-published-${suffix}-source.jpg`,
      coursePath: `/webstudio-published-${suffix}`,
    });

    const singleByDocumentIdCtx = await runRequest(middleware, {
      path: `/api/public/courses/${encodeURIComponent(publishedCourse.documentId)}`,
      query: { fields: 'title,slug' },
    });
    assert.equal(singleByDocumentIdCtx.status, 404);

    const resolveByPathCtx = await runRequest(middleware, {
      path: '/api/public/courses/resolve',
      query: {
        path: `/webstudio-published-${suffix}`,
        fields: 'title,coursePath',
      },
    });
    assert.deepEqual(resolveByPathCtx.body.data, {
      title: `Webstudio Published ${suffix}`,
      coursePath: `/webstudio-published-${suffix}`,
    });

    const resolveByUrlCtx = await runRequest(middleware, {
      path: '/api/public/courses/resolve',
      query: {
        url: `https://example.com/webstudio-published-${suffix}`,
        fields: 'title,courseLink',
      },
    });
    assert.equal(resolveByUrlCtx.status, 404);

    const unpublishedSingleCtx = await runRequest(middleware, {
      path: `/api/public/courses/${encodeURIComponent(`webstudio-hidden-${suffix}`)}`,
      query: { fields: 'title' },
    });
    assert.equal(unpublishedSingleCtx.status, 404);

    const unpublishedResolveCtx = await runRequest(middleware, {
      path: '/api/public/courses/resolve',
      query: {
        path: `/webstudio-hidden-${suffix}`,
        includeUnpublished: 'true',
        fields: 'title,slug',
      },
    });
    assert.equal(unpublishedResolveCtx.status, 404);

    console.log('webstudio api regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
