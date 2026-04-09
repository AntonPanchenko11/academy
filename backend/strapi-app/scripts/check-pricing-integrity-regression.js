'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  assertCoursePriceChangeSequenceIntegrity,
  assertPricingIntegrity,
} = require('../src/utils/course-price-increase');
const { createTempDatabaseCopy, loadEnvFile, loadStrapiForScript } = require('./lib/strapi-script-helpers');
const COURSE_UID = 'api::course.course';
const COURSE_PRICE_CHANGE_UID = 'api::course-price-change.course-price-change';

const main = async () => {
  loadEnvFile();

  assert.throws(
    () => assertCoursePriceChangeSequenceIntegrity({
      id: 1,
      title: 'Duplicate effectiveAt',
      basePrice: 1000,
      priceChanges: [
        { id: 11, effectiveAt: '2026-01-01T10:00:00.000Z', targetBasePrice: 1200 },
        { id: 12, effectiveAt: '2026-01-01T10:00:00.000Z', targetBasePrice: 1400 },
      ],
    }),
    /duplicate scheduled price changes/i
  );

  assert.throws(
    () => assertCoursePriceChangeSequenceIntegrity({
      id: 2,
      title: 'Non increasing sequence',
      basePrice: 1000,
      priceChanges: [
        { id: 21, effectiveAt: '2026-01-01T10:00:00.000Z', targetBasePrice: 1200 },
        { id: 22, effectiveAt: '2026-01-02T10:00:00.000Z', targetBasePrice: 1100 },
      ],
    }),
    /non-increasing scheduled price change/i
  );

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-pricing-integrity-');
  process.env.DATABASE_FILENAME = tempDbPath;

  const strapi = await loadStrapiForScript();

  try {
    const courseDocuments = strapi.documents(COURSE_UID);
    const priceChangeDocuments = strapi.documents(COURSE_PRICE_CHANGE_UID);
    const suffix = String(Date.now());

    const course = await courseDocuments.create({
      data: {
        title: `Pricing Integrity Course ${suffix}`,
        publish: true,
        date: '2026-07-25',
        waitlist: false,
        courseStatus: 'Идет набор',
        basePrice: 1000,
        courseLink: `https://example.com/pricing-integrity-${suffix}`,
      },
    });

    await priceChangeDocuments.create({
      data: {
        course: { id: course.id },
        effectiveAt: '2026-08-01T10:00:00.000Z',
        targetBasePrice: 1200,
      },
    });

    await priceChangeDocuments.create({
      data: {
        course: { id: course.id },
        effectiveAt: '2026-08-02T10:00:00.000Z',
        targetBasePrice: 1500,
      },
    });

    const integrity = await assertPricingIntegrity(strapi);
    assert.ok(integrity.checkedCourses > 0);

    console.log('pricing integrity regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
