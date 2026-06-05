'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createStrapi } = require('@strapi/strapi');

const {
  COURSE_CONTENT_BLOCKS_POPULATE,
  serializeCourse,
} = require('../src/utils/tilda-course');
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
      catalogImg: params.catalogImg || null,
      heroImg: params.heroImg || null,
      slug: params.slug,
      comment: params.comment || null,
      contentBlocks: Array.isArray(params.contentBlocks) ? params.contentBlocks : [],
    },
  });
};

const loadSerializedCourses = async (strapi) => {
  const courses = await strapi.db.query(COURSE_UID).findMany({
    populate: {
      discount: true,
      priceChanges: true,
      contentBlocks: COURSE_CONTENT_BLOCKS_POPULATE,
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
      catalogImg: `https://static.tildacdn.com/tilda-published-${suffix}.jpg`,
      heroImg: `https://static.tildacdn.com/tilda-published-${suffix}-source.jpg`,
      comment: 'published comment',
      basePrice: 1400,
      contentBlocks: [
        {
          __component: 'course-blocks.hero',
          title: 'Hero из Dynamic Zone',
          subtitle: 'Редактируемый главный экран',
          statusLabel: 'Новый поток',
          imageUrl: `https://static.tildacdn.com/tilda-published-${suffix}-hero-dz.jpg`,
          primaryButtonLabel: 'Оставить заявку',
          primaryButtonUrl: `https://example.com/tilda-published-${suffix}`,
          priceLabel: 'от 1400 ₽',
          facts: [
            {
              label: 'Формат',
              value: 'Онлайн',
            },
          ],
        },
        {
          __component: 'course-blocks.text-section',
          title: 'О курсе',
          body: 'Описание курса для Tilda',
        },
        {
          __component: 'course-blocks.faq',
          title: 'FAQ',
          items: [
            {
              question: 'Можно оплатить онлайн?',
              answer: 'Да, можно.',
            },
          ],
        },
      ],
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
      query: { fields: 'title,price,catalogImg,heroImg,coursePath' },
    });
    assert.equal(singleBySlugCtx.body.ok, true);
    assert.deepEqual(singleBySlugCtx.body.data, {
      title: `Tilda Published ${suffix}`,
      price: 1400,
      catalogImg: `https://static.tildacdn.com/tilda-published-${suffix}.jpg`,
      heroImg: `https://static.tildacdn.com/tilda-published-${suffix}-source.jpg`,
      coursePath: `/tilda-published-${suffix}`,
    });

    const singleWithBlocksCtx = await runRequest(middleware, {
      path: `/api/tilda/courses/${encodeURIComponent(`tilda-published-${suffix}`)}`,
      query: { fields: 'title,contentBlocks' },
    });
    assert.equal(singleWithBlocksCtx.body.data.title, `Tilda Published ${suffix}`);
    assert.equal(singleWithBlocksCtx.body.data.contentBlocks.length, 3);
    assert.deepEqual(
      singleWithBlocksCtx.body.data.contentBlocks.map((block) => block.__component),
      ['course-blocks.hero', 'course-blocks.text-section', 'course-blocks.faq']
    );
    assert.equal(singleWithBlocksCtx.body.data.contentBlocks[0].title, 'Hero из Dynamic Zone');
    assert.equal(singleWithBlocksCtx.body.data.contentBlocks[0].facts[0].label, 'Формат');
    assert.equal(singleWithBlocksCtx.body.data.contentBlocks[1].title, 'О курсе');
    assert.equal(singleWithBlocksCtx.body.data.contentBlocks[2].items[0].question, 'Можно оплатить онлайн?');

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
