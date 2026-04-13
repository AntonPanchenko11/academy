'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { createStrapi } = require('@strapi/strapi');

const { serializeCourse } = require('../src/utils/tilda-course');
const { syncContentManagerConfig } = require('../src/utils/content-manager-config');
const { applyDueCoursePriceChanges } = require('../src/utils/course-price-increase');
const {
  APP_DIR,
  createTempDatabaseCopy,
  loadEnvFile,
} = require('./lib/strapi-script-helpers');
const COURSE_CONFIG_KEY = 'plugin_content_manager_configuration_content_types::api::course.course';
const COURSE_PRICE_CHANGE_UID = 'api::course-price-change.course-price-change';
const COURSE_UID = 'api::course.course';

const seedLegacyCourseConfig = (dbPath) => {
  const db = new Database(dbPath);

  try {
    const row = db.prepare('SELECT id, value FROM strapi_core_store_settings WHERE key = ?').get(COURSE_CONFIG_KEY);
    assert.ok(row, 'Expected course content-manager config row to exist');

    const current = JSON.parse(String(row.value || '{}'));
    const next = {
      ...current,
      layouts: {
        ...(current.layouts || {}),
        edit: [
          ...((current.layouts && Array.isArray(current.layouts.edit)) ? current.layouts.edit : []),
          [{ name: 'scheduledPriceIncreases', size: 12 }],
          [{ name: 'scheduledIncreaseIds', size: 12 }],
        ],
      },
      metadatas: {
        ...(current.metadatas || {}),
        scheduledPriceIncreases: {
          edit: {
            label: 'Legacy scheduled field',
          },
        },
        scheduledIncreaseIds: {
          edit: {
            label: 'Legacy field',
          },
        },
      },
    };

    delete next.metadatas.priceChanges;

    db.prepare('UPDATE strapi_core_store_settings SET value = ? WHERE id = ?')
      .run(JSON.stringify(next), row.id);
  } finally {
    db.close();
  }
};

const flattenEditLayoutFields = (layout) => {
  return (Array.isArray(layout) ? layout : [])
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .map((item) => item && item.name)
    .filter(Boolean);
};

const getCourseConfig = async (strapi) => {
  const row = await strapi.db.connection('strapi_core_store_settings')
    .select(['value'])
    .where({ key: COURSE_CONFIG_KEY })
    .first();

  assert.ok(row, 'Expected synced course content-manager config row to exist');
  return JSON.parse(String(row.value || '{}'));
};

const insertDuplicateCourseRow = async (strapi, course) => {
  const nowIso = new Date().toISOString();
  const [duplicateId] = await strapi.db.connection('courses').insert({
    document_id: `duplicate-${Date.now()}`,
    title: `${course.title} duplicate`,
    slug: null,
    publish: course.publish !== false,
    comment: 'duplicate for regression',
    date: course.date || null,
    waitlist: course.waitlist === true,
    course_status: course.courseStatus || 'Идет набор',
    study_days: course.studyDays || null,
    hours: course.hours || null,
    base_price: course.basePrice || 1000,
    education_document: course.educationDocument || null,
    course_link: course.courseLink,
    created_at: nowIso,
    updated_at: nowIso,
    published_at: nowIso,
    locale: null,
  });

  return duplicateId;
};

const createRegressionCourse = async (strapi) => {
  const suffix = Date.now();

  return strapi.documents(COURSE_UID).create({
    data: {
      title: `Regression Course ${suffix}`,
      publish: true,
      courseStatus: 'Идет набор',
      courseLink: `https://example.com/regression-course-${suffix}`,
      basePrice: 1000,
    },
  });
};

const waitFor = async (predicate, timeoutMs = 5000, intervalMs = 50) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
};

const loadStoredCourse = async (strapi, courseId) => {
  return strapi.db.query(COURSE_UID).findOne({
    where: { id: courseId },
    populate: {
      discount: true,
      priceChanges: true,
    },
  });
};

const main = async () => {
  loadEnvFile();

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-course-edit-');
  seedLegacyCourseConfig(tempDbPath);

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
    await syncContentManagerConfig(strapi);

    const syncedCourseConfig = await getCourseConfig(strapi);
    const syncedEditFields = flattenEditLayoutFields(
      syncedCourseConfig && syncedCourseConfig.layouts && syncedCourseConfig.layouts.edit
    );

    assert.ok(
      syncedEditFields.includes('priceChanges'),
      'Expected priceChanges to be present in course edit layout'
    );
    assert.ok(
      syncedEditFields.includes('imageUrl'),
      'Expected imageUrl to be present in course edit layout'
    );
    assert.ok(
      !syncedEditFields.includes('scheduledPriceIncreases'),
      'Expected scheduledPriceIncreases to be removed from course edit layout'
    );
    assert.ok(
      !syncedEditFields.includes('scheduledIncreaseIds'),
      'Expected legacy scheduledIncreaseIds field to be removed from course edit layout'
    );
    assert.ok(
      !(syncedCourseConfig.metadatas && syncedCourseConfig.metadatas.scheduledPriceIncreases),
      'Expected scheduledPriceIncreases metadata to be removed'
    );
    assert.ok(
      syncedCourseConfig.metadatas && syncedCourseConfig.metadatas.priceChanges,
      'Expected priceChanges metadata to be present in course content-manager config'
    );
    assert.equal(
      syncedCourseConfig.metadatas && syncedCourseConfig.metadatas.imageUrl
        && syncedCourseConfig.metadatas.imageUrl.edit
        && syncedCourseConfig.metadatas.imageUrl.edit.label,
      'Ссылка на картинку курса'
    );

    const seedCourse = await createRegressionCourse(strapi);
    const documents = strapi.documents(COURSE_UID);
    const priceChangeDocuments = strapi.documents(COURSE_PRICE_CHANGE_UID);

    const simpleUpdate = await documents.update({
      documentId: seedCourse.documentId,
      data: {
        comment: 'regression-simple-update',
      },
    });

    assert.equal(simpleUpdate.comment, 'regression-simple-update');

    const duplicateId = await insertDuplicateCourseRow(strapi, simpleUpdate);
    assert.ok(duplicateId, 'Expected duplicate course row to be inserted for uniqueness regression');

    const priceOnlyUpdate = await documents.update({
      documentId: seedCourse.documentId,
      data: {
        basePrice: 1200,
      },
    });

    assert.equal(priceOnlyUpdate.basePrice, 1200);

    const futureDate = new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString();
    const futureChange = await priceChangeDocuments.create({
      data: {
        course: { id: seedCourse.id },
        effectiveAt: futureDate,
        targetBasePrice: 1900,
        comment: 'created by regression',
      },
      populate: {
        course: true,
      },
    });

    assert.equal(futureChange.targetBasePrice, 1900);
    assert.equal(futureChange.course.id, seedCourse.id);

    const updatedFutureChange = await priceChangeDocuments.update({
      documentId: futureChange.documentId,
      data: {
        targetBasePrice: 2100,
        comment: 'updated by regression',
      },
      populate: {
        course: true,
      },
    });

    assert.equal(updatedFutureChange.targetBasePrice, 2100);
    assert.equal(updatedFutureChange.comment, 'updated by regression');

    await assert.rejects(
      () => priceChangeDocuments.create({
        data: {
          course: { id: seedCourse.id },
          effectiveAt: new Date(Date.now() + (48 * 60 * 60 * 1000)).toISOString(),
          targetBasePrice: 2200,
        },
      }),
      /меньше следующей запланированной цены 2100/i
    );

    const courseWithFutureChange = await loadStoredCourse(strapi, seedCourse.id);
    assert.equal(courseWithFutureChange.priceChanges.length, 1);
    assert.equal(courseWithFutureChange.priceChanges[0].targetBasePrice, 2100);

    const serializedWithFutureChange = serializeCourse(courseWithFutureChange);
    assert.equal(serializedWithFutureChange.basePrice, 1200);
    assert.equal(serializedWithFutureChange.priceChanges.length, 1);
    assert.equal(serializedWithFutureChange.nextPriceChange.targetBasePrice, 2100);

    await priceChangeDocuments.create({
      data: {
        course: { id: seedCourse.id },
        effectiveAt: new Date(Date.now() - (2 * 60 * 1000)).toISOString(),
        targetBasePrice: 1500,
        comment: 'older due by regression',
      },
    });

    await priceChangeDocuments.create({
      data: {
        course: { id: seedCourse.id },
        effectiveAt: new Date(Date.now() - (60 * 1000)).toISOString(),
        targetBasePrice: 1700,
        comment: 'due by regression',
      },
    });

    const appliedCourse = await waitFor(async () => {
      const storedCourse = await loadStoredCourse(strapi, seedCourse.id);
      if (!storedCourse) return null;

      if (storedCourse.basePrice !== 1700) return null;
      if (!Array.isArray(storedCourse.priceChanges) || storedCourse.priceChanges.length !== 1) return null;
      if (storedCourse.priceChanges[0].targetBasePrice !== 2100) return null;
      return storedCourse;
    });

    assert.ok(appliedCourse, 'Expected due price change to update basePrice and be deleted');

    const remainingChanges = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findMany({
      where: {
        course: {
          id: seedCourse.id,
        },
      },
      orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
    });
    assert.equal(remainingChanges.length, 1);
    assert.equal(remainingChanges[0].targetBasePrice, 2100);

    const serializedAfterApply = serializeCourse(appliedCourse);
    assert.equal(serializedAfterApply.basePrice, 1700);
    assert.equal(serializedAfterApply.priceChanges.length, 1);
    assert.equal(serializedAfterApply.nextPriceChange.targetBasePrice, 2100);
    assert.equal(serializedAfterApply.price, 1700);

    const multiApplyCourse = await createRegressionCourse(strapi);
    await priceChangeDocuments.create({
      data: {
        course: { id: multiApplyCourse.id },
        effectiveAt: new Date(Date.now() - (3 * 60 * 1000)).toISOString(),
        targetBasePrice: 1300,
      },
    });
    await priceChangeDocuments.create({
      data: {
        course: { id: multiApplyCourse.id },
        effectiveAt: new Date(Date.now() - (2 * 60 * 1000)).toISOString(),
        targetBasePrice: 1600,
      },
    });

    const multiApplyResult = await waitFor(async () => {
      const storedCourse = await loadStoredCourse(strapi, multiApplyCourse.id);
      if (!storedCourse) return null;
      return storedCourse.basePrice === 1600 ? storedCourse : null;
    });
    assert.ok(multiApplyResult, 'Expected multiple due price changes for one course to be applied in one runtime cycle');

    const multiApplyRemainingChanges = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findMany({
      where: {
        course: {
          id: multiApplyCourse.id,
        },
      },
      orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
    });
    assert.equal(multiApplyRemainingChanges.length, 0);

    const repeatedApplyResult = await applyDueCoursePriceChanges(strapi);
    assert.deepEqual(repeatedApplyResult, {
      appliedChanges: 0,
      updatedCourses: 0,
    });

    const deleteCascadeCourse = await createRegressionCourse(strapi);
    const deleteCascadePriceChange = await priceChangeDocuments.create({
      data: {
        course: { id: deleteCascadeCourse.id },
        effectiveAt: new Date(Date.now() + (96 * 60 * 60 * 1000)).toISOString(),
        targetBasePrice: 2600,
      },
    });

    await documents.delete({ documentId: deleteCascadeCourse.documentId });

    const deletedCascadePriceChange = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findOne({
      where: { documentId: deleteCascadePriceChange.documentId },
    });
    assert.equal(
      deletedCascadePriceChange,
      null,
      'Expected deleting a course to delete its scheduled price changes'
    );

    await priceChangeDocuments.delete({ documentId: updatedFutureChange.documentId });
    await documents.delete({ documentId: multiApplyCourse.documentId });
    await documents.delete({ documentId: seedCourse.documentId });

    console.log('course edit regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
