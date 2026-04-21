'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const { migrateCourseImageFields } = require('../src/utils/course');
const {
  createTempDatabaseCopy,
  loadEnvFile,
  loadStrapiForScript,
} = require('./lib/strapi-script-helpers');

const insertLegacyCourseRows = async (strapi, suffix) => {
  const nowIso = new Date().toISOString();
  await strapi.db.connection('courses').insert([
    {
      document_id: `legacy-course-${suffix}`,
      title: `Legacy Course ${suffix}`,
      slug: null,
      publish: true,
      comment: 'legacy image fields',
      date: '2026-06-20',
      waitlist: false,
      course_status: 'Идет набор',
      study_days: null,
      hours: null,
      base_price: 1000,
      education_document: 'Сертификат',
      course_link: `https://example.com/legacy-course-${suffix}`,
      image_url: `https://static.tildacdn.com/legacy-course-${suffix}-catalog.jpg`,
      tilda_image_url: `https://static.tildacdn.com/legacy-course-${suffix}-hero.jpg`,
      catalog_img: null,
      hero_img: null,
      created_at: nowIso,
      updated_at: nowIso,
      published_at: nowIso,
      locale: null,
    },
    {
      document_id: `existing-target-course-${suffix}`,
      title: `Existing Target Course ${suffix}`,
      slug: null,
      publish: true,
      comment: 'existing target image fields',
      date: '2026-06-21',
      waitlist: false,
      course_status: 'Идет набор',
      study_days: null,
      hours: null,
      base_price: 1100,
      education_document: 'Сертификат',
      course_link: `https://example.com/existing-target-course-${suffix}`,
      image_url: `https://static.tildacdn.com/existing-target-course-${suffix}-legacy-catalog.jpg`,
      tilda_image_url: `https://static.tildacdn.com/existing-target-course-${suffix}-legacy-hero.jpg`,
      catalog_img: `https://static.tildacdn.com/existing-target-course-${suffix}-catalog.jpg`,
      hero_img: `https://static.tildacdn.com/existing-target-course-${suffix}-hero.jpg`,
      created_at: nowIso,
      updated_at: nowIso,
      published_at: nowIso,
      locale: null,
    },
  ]);
};

const main = async () => {
  loadEnvFile();

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-course-image-fields-migration-');
  process.env.DATABASE_FILENAME = tempDbPath;

  const strapi = await loadStrapiForScript();

  try {
    const suffix = String(Date.now());
    assert.equal(await strapi.db.connection.schema.hasColumn('courses', 'catalog_img'), true);
    assert.equal(await strapi.db.connection.schema.hasColumn('courses', 'hero_img'), true);

    if (!(await strapi.db.connection.schema.hasColumn('courses', 'image_url'))) {
      await strapi.db.connection.schema.alterTable('courses', (table) => {
        table.text('image_url');
      });
    }

    if (!(await strapi.db.connection.schema.hasColumn('courses', 'tilda_image_url'))) {
      await strapi.db.connection.schema.alterTable('courses', (table) => {
        table.text('tilda_image_url');
      });
    }

    await insertLegacyCourseRows(strapi, suffix);

    const firstRun = await migrateCourseImageFields(strapi);
    assert.equal(firstRun.skipped, false);
    assert.equal(firstRun.updatedCourses, 1);
    assert.equal(firstRun.updatedCatalogImg, 1);
    assert.equal(firstRun.updatedHeroImg, 1);

    const legacyCourse = await strapi.db.connection('courses')
      .select(['image_url', 'tilda_image_url', 'catalog_img', 'hero_img'])
      .where({ document_id: `legacy-course-${suffix}` })
      .first();

    assert.equal(legacyCourse.catalog_img, legacyCourse.image_url);
    assert.equal(legacyCourse.hero_img, legacyCourse.tilda_image_url);

    const existingTargetCourse = await strapi.db.connection('courses')
      .select(['image_url', 'tilda_image_url', 'catalog_img', 'hero_img'])
      .where({ document_id: `existing-target-course-${suffix}` })
      .first();

    assert.equal(
      existingTargetCourse.catalog_img,
      `https://static.tildacdn.com/existing-target-course-${suffix}-catalog.jpg`
    );
    assert.equal(
      existingTargetCourse.hero_img,
      `https://static.tildacdn.com/existing-target-course-${suffix}-hero.jpg`
    );
    assert.notEqual(existingTargetCourse.catalog_img, existingTargetCourse.image_url);
    assert.notEqual(existingTargetCourse.hero_img, existingTargetCourse.tilda_image_url);

    const secondRun = await migrateCourseImageFields(strapi);
    assert.equal(secondRun.skipped, false);
    assert.equal(secondRun.updatedCourses, 0);
    assert.equal(secondRun.updatedCatalogImg, 0);
    assert.equal(secondRun.updatedHeroImg, 0);

    console.log('course image fields migration regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
