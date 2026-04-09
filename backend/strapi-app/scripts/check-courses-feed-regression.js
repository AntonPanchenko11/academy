'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const { createPublicApiMiddleware } = require('../src/server/public-api-middleware');
const { serializeCourse } = require('../src/utils/tilda-course');
const { createTempDatabaseCopy, loadEnvFile, loadStrapiForScript } = require('./lib/strapi-script-helpers');
const COURSE_UID = 'api::course.course';

const createCourse = async (documents, suffix, params = {}) => {
  return documents.create({
    data: {
      title: params.title || `Schedule Course ${suffix}`,
      publish: params.publish !== false,
      date: params.date || '2026-07-10',
      waitlist: params.waitlist === true,
      courseStatus: params.courseStatus || 'Идет набор',
      studyDays: params.studyDays || 'пн-ср',
      hours: params.hours === undefined ? 24 : params.hours,
      basePrice: params.basePrice === undefined ? 1000 : params.basePrice,
      educationDocument: params.educationDocument || 'Сертификат',
      courseLink: params.courseLink || `https://example.com/${params.slug || `schedule-course-${suffix}`}`,
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

const createMockCtx = ({ method = 'GET', requestPath }) => {
  const ctx = {
    method,
    path: requestPath,
    query: {},
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

const main = async () => {
  loadEnvFile();

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-courses-feed-');
  process.env.DATABASE_FILENAME = tempDbPath;

  const strapi = await loadStrapiForScript();

  try {
    const courseDocuments = strapi.documents(COURSE_UID);
    const suffix = String(Date.now());

    await createCourse(courseDocuments, `${suffix}-published`, {
      title: `Schedule Published ${suffix}`,
      slug: `schedule-published-${suffix}`,
      courseLink: `https://example.com/schedule-published-${suffix}`,
      basePrice: 4100,
      date: '2026-07-12',
    });

    await createCourse(courseDocuments, `${suffix}-wait`, {
      title: `Schedule Waitlist ${suffix}`,
      slug: `schedule-waitlist-${suffix}`,
      courseLink: `https://example.com/schedule-waitlist-${suffix}`,
      waitlist: true,
      basePrice: 4300,
      date: '2026-08-03',
    });

    await createCourse(courseDocuments, `${suffix}-hidden`, {
      title: `Schedule Hidden ${suffix}`,
      slug: `schedule-hidden-${suffix}`,
      courseLink: `https://example.com/schedule-hidden-${suffix}`,
      publish: false,
      basePrice: 4500,
      date: '2026-09-01',
    });

    const middleware = createPublicApiMiddleware({
      strapi,
      loadSerializedCourses,
      checkDatabaseHealth,
    });

    const ctx = createMockCtx({ requestPath: '/api/courses-feed' });
    await middleware(ctx, async () => {});

    assert.equal(ctx.status, 200);
    assert.ok(Array.isArray(ctx.body.data));
    assert.ok(ctx.body.data.some((course) => course.title === `Schedule Published ${suffix}`));
    assert.ok(ctx.body.data.some((course) => course.title === `Schedule Waitlist ${suffix}`));
    assert.ok(!ctx.body.data.some((course) => course.title === `Schedule Hidden ${suffix}`));

    const publishedCourse = ctx.body.data.find((course) => course.slug === `schedule-published-${suffix}`);
    assert.deepEqual(
      Object.keys(publishedCourse).sort(),
      [
        'activeDiscount',
        'basePrice',
        'comment',
        'courseLink',
        'coursePath',
        'courseStatus',
        'date',
        'dateLabel',
        'day',
        'discountPercent',
        'documentId',
        'educationDocument',
        'hours',
        'hoursLabel',
        'id',
        'month',
        'monthLabel',
        'nextPriceChange',
        'price',
        'priceChanges',
        'publish',
        'slug',
        'studyDays',
        'title',
        'waitlist',
        'weekdayShort',
      ]
    );
    assert.equal(publishedCourse.price, 4100);
    assert.equal(publishedCourse.publish, true);

    console.log('courses-feed regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
