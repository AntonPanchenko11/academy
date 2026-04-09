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
      title: params.title || `Tilda Course ${suffix}`,
      publish: params.publish !== false,
      date: params.date || '2026-06-15',
      waitlist: params.waitlist === true,
      courseStatus: params.courseStatus || 'Идет набор',
      studyDays: params.studyDays || 'пн-ср',
      hours: params.hours === undefined ? 24 : params.hours,
      basePrice: params.basePrice === undefined ? 1000 : params.basePrice,
      educationDocument: params.educationDocument || 'Сертификат',
      courseLink: params.courseLink || `https://example.com/${params.slug || `tilda-course-${suffix}`}`,
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

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-tilda-api-');
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
      title: `Tilda Published ${suffix}`,
      slug: `tilda-published-${suffix}`,
      courseLink: `https://example.com/tilda-published-${suffix}`,
      comment: 'published comment',
      basePrice: 1400,
    });

    const waitlistCourse = await createCourse(courseDocuments, `${suffix}-wait`, {
      title: `Tilda Waitlist ${suffix}`,
      slug: `tilda-waitlist-${suffix}`,
      courseLink: `https://example.com/tilda-waitlist-${suffix}`,
      waitlist: true,
      basePrice: 2200,
    });

    const unpublishedCourse = await createCourse(courseDocuments, `${suffix}-unpub`, {
      title: `Tilda Hidden ${suffix}`,
      slug: `tilda-hidden-${suffix}`,
      courseLink: `https://example.com/tilda-hidden-${suffix}`,
      publish: false,
      basePrice: 3300,
    });

    const middleware = createPublicApiMiddleware({
      strapi,
      loadSerializedCourses,
      checkDatabaseHealth,
    });

    const listCtx = await runRequest(middleware, {
      path: '/api/tilda/courses',
      query: { fields: 'title,price,dateLabel' },
    });

    assert.equal(listCtx.status, 200);
    assert.equal(listCtx.body.ok, true);
    assert.ok(Array.isArray(listCtx.body.data));
    assert.ok(listCtx.body.data.some((item) => item.title === `Tilda Published ${suffix}`));
    assert.ok(listCtx.body.data.some((item) => item.title === `Tilda Waitlist ${suffix}`));
    assert.ok(!listCtx.body.data.some((item) => item.title === `Tilda Hidden ${suffix}`));
    assert.deepEqual(
      Object.keys(listCtx.body.data[0]).sort(),
      ['dateLabel', 'price', 'title']
    );

    const includeUnpublishedCtx = await runRequest(middleware, {
      path: '/api/tilda/courses',
      query: { includeUnpublished: 'true', fields: 'title,slug' },
    });
    assert.ok(includeUnpublishedCtx.body.data.some((item) => item.slug === `tilda-hidden-${suffix}`));

    const waitlistOnlyCtx = await runRequest(middleware, {
      path: '/api/tilda/courses',
      query: { waitlist: 'true', fields: 'title,waitlist' },
    });
    assert.deepEqual(waitlistOnlyCtx.body.data, [
      { title: `Tilda Waitlist ${suffix}`, waitlist: true },
    ]);

    const singleBySlugCtx = await runRequest(middleware, {
      path: `/api/tilda/courses/${encodeURIComponent(`tilda-published-${suffix}`)}`,
      query: { fields: 'title,price,coursePath' },
    });
    assert.equal(singleBySlugCtx.body.ok, true);
    assert.deepEqual(singleBySlugCtx.body.data, {
      title: `Tilda Published ${suffix}`,
      price: 1400,
      coursePath: `/tilda-published-${suffix}`,
    });

    const singleByDocumentIdCtx = await runRequest(middleware, {
      path: `/api/tilda/courses/${encodeURIComponent(publishedCourse.documentId)}`,
      query: { fields: 'title,slug' },
    });
    assert.deepEqual(singleByDocumentIdCtx.body.data, {
      title: `Tilda Published ${suffix}`,
      slug: `tilda-published-${suffix}`,
    });

    const resolveByPathCtx = await runRequest(middleware, {
      path: '/api/tilda/courses/resolve',
      query: {
        path: `/tilda-published-${suffix}`,
        fields: 'title,coursePath',
      },
    });
    assert.deepEqual(resolveByPathCtx.body.data, {
      title: `Tilda Published ${suffix}`,
      coursePath: `/tilda-published-${suffix}`,
    });

    const resolveByUrlCtx = await runRequest(middleware, {
      path: '/api/tilda/courses/resolve',
      query: {
        url: `https://example.com/tilda-published-${suffix}`,
        fields: 'title,courseLink',
      },
    });
    assert.deepEqual(resolveByUrlCtx.body.data, {
      title: `Tilda Published ${suffix}`,
      courseLink: `https://example.com/tilda-published-${suffix}`,
    });

    const resolveByTitleCtx = await runRequest(middleware, {
      path: '/api/tilda/courses/resolve',
      query: {
        title: `Tilda Published ${suffix}`,
        fields: 'title,slug',
      },
    });
    assert.deepEqual(resolveByTitleCtx.body.data, {
      title: `Tilda Published ${suffix}`,
      slug: `tilda-published-${suffix}`,
    });

    const missingCourseCtx = await runRequest(middleware, {
      path: '/api/tilda/courses/resolve',
      query: {
        slug: `missing-${suffix}`,
      },
    });
    assert.equal(missingCourseCtx.status, 404);
    assert.deepEqual(missingCourseCtx.body, {
      ok: false,
      error: 'Course not found.',
    });

    const unpublishedSingleCtx = await runRequest(middleware, {
      path: `/api/tilda/courses/${encodeURIComponent(`tilda-hidden-${suffix}`)}`,
      query: { fields: 'title' },
    });
    assert.equal(unpublishedSingleCtx.status, 404);

    const unpublishedSingleAllowedCtx = await runRequest(middleware, {
      path: `/api/tilda/courses/${encodeURIComponent(`tilda-hidden-${suffix}`)}`,
      query: { includeUnpublished: 'true', fields: 'title,slug' },
    });
    assert.deepEqual(unpublishedSingleAllowedCtx.body.data, {
      title: `Tilda Hidden ${suffix}`,
      slug: `tilda-hidden-${suffix}`,
    });

    console.log('tilda api regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
