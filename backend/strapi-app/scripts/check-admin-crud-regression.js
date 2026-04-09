'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const { serializeCourse } = require('../src/utils/tilda-course');
const {
  APP_DIR,
  createTempDatabaseCopy,
  loadEnvFile,
} = require('./lib/strapi-script-helpers');

const COURSE_UID = 'api::course.course';
const DISCOUNT_UID = 'api::discount.discount';
const COURSE_PRICE_CHANGE_UID = 'api::course-price-change.course-price-change';

const loadStoredCourse = async (strapi, courseId) => {
  return strapi.db.query(COURSE_UID).findOne({
    where: { id: courseId },
    populate: {
      discount: true,
      priceChanges: true,
    },
  });
};

const serializeStoredCourse = async (strapi, courseId) => {
  const course = await loadStoredCourse(strapi, courseId);
  return serializeCourse(course);
};

const main = async () => {
  loadEnvFile();

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-admin-crud-');
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
    const discountDocuments = strapi.documents(DISCOUNT_UID);
    const priceChangeDocuments = strapi.documents(COURSE_PRICE_CHANGE_UID);
    const suffix = String(Date.now());

    const course = await courseDocuments.create({
      data: {
        title: `Admin CRUD Course ${suffix}`,
        publish: true,
        date: '2026-05-20',
        waitlist: false,
        courseStatus: 'Идет набор',
        studyDays: 'сб-вс',
        hours: 32,
        basePrice: 1000,
        educationDocument: 'Сертификат',
        courseLink: `https://example.com/admin-crud-course-${suffix}`,
      },
    });

    assert.equal(course.basePrice, 1000);
    assert.equal(course.title, `Admin CRUD Course ${suffix}`);

    const updatedCourse = await courseDocuments.update({
      documentId: course.documentId,
      data: {
        comment: 'updated from admin regression',
        basePrice: 1200,
      },
    });

    assert.equal(updatedCourse.comment, 'updated from admin regression');
    assert.equal(updatedCourse.basePrice, 1200);

    await assert.rejects(
      () => courseDocuments.create({
        data: {
          title: `Admin CRUD Duplicate ${suffix}`,
          publish: true,
          date: '2026-05-20',
          waitlist: false,
          courseStatus: 'Идет набор',
          basePrice: 900,
          courseLink: `https://example.com/admin-crud-course-${suffix}`,
        },
      }),
      /уже существует/i
    );

    await assert.rejects(
      () => courseDocuments.create({
        data: {
          title: `Admin CRUD Link Identity Duplicate ${suffix}`,
          publish: true,
          date: '2026-05-20',
          waitlist: false,
          courseStatus: 'Идет набор',
          basePrice: 950,
          courseLink: `HTTPS://EXAMPLE.COM/admin-crud-course-${suffix}/`,
        },
      }),
      /уже существует/i
    );

    const firstEffectiveAt = new Date(Date.now() + (48 * 60 * 60 * 1000)).toISOString();
    const secondEffectiveAt = new Date(Date.now() + (96 * 60 * 60 * 1000)).toISOString();

    const priceChange = await priceChangeDocuments.create({
      data: {
        course: { id: course.id },
        effectiveAt: firstEffectiveAt,
        targetBasePrice: 1500,
        comment: 'created from admin regression',
      },
      populate: {
        course: true,
      },
    });

    assert.equal(priceChange.course.id, course.id);
    assert.equal(priceChange.targetBasePrice, 1500);

    const updatedPriceChange = await priceChangeDocuments.update({
      documentId: priceChange.documentId,
      data: {
        targetBasePrice: 1600,
      },
      populate: {
        course: true,
      },
    });

    assert.equal(updatedPriceChange.targetBasePrice, 1600);

    await assert.rejects(
      () => priceChangeDocuments.create({
        data: {
          course: { id: course.id },
          effectiveAt: firstEffectiveAt,
          targetBasePrice: 1700,
        },
      }),
      /уже существует изменение цены на эту дату и время/i
    );

    await assert.rejects(
      () => priceChangeDocuments.create({
        data: {
          course: { id: course.id },
          effectiveAt: secondEffectiveAt,
          targetBasePrice: 1500,
        },
      }),
      /больше предыдущей цены 1600/i
    );

    await assert.rejects(
      () => priceChangeDocuments.create({
        data: {
          course: { id: course.id },
          effectiveAt: new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString(),
          targetBasePrice: 1700,
        },
      }),
      /не более чем на 24 часа назад/i
    );

    const discount = await discountDocuments.create({
      data: {
        title: `Admin CRUD Discount ${suffix}`,
        percent: 25,
        active: true,
        comment: 'created from admin regression',
        courses: [{ id: course.id }],
      },
      populate: {
        courses: true,
      },
    });

    assert.deepEqual(discount.courses.map((item) => item.id), [course.id]);
    assert.equal(discount.percent, 25);

    const serializedCourseWithDiscount = await serializeStoredCourse(strapi, course.id);
    assert.equal(serializedCourseWithDiscount.basePrice, 1200);
    assert.equal(serializedCourseWithDiscount.discountPercent, 25);
    assert.equal(serializedCourseWithDiscount.price, 900);

    const updatedDiscount = await discountDocuments.update({
      documentId: discount.documentId,
      data: {
        active: false,
        percent: 30,
        comment: 'updated from admin regression',
      },
      populate: {
        courses: true,
      },
    });

    assert.equal(updatedDiscount.active, false);
    assert.equal(updatedDiscount.percent, 30);
    assert.equal(updatedDiscount.comment, 'updated from admin regression');

    const serializedCourseWithoutActiveDiscount = await serializeStoredCourse(strapi, course.id);
    assert.equal(serializedCourseWithoutActiveDiscount.discountPercent, 0);
    assert.equal(serializedCourseWithoutActiveDiscount.price, 1200);
    assert.equal(serializedCourseWithoutActiveDiscount.activeDiscount, null);

    await assert.rejects(
      () => discountDocuments.create({
        data: {
          title: '',
          percent: 0,
          active: true,
          courses: [{ id: course.id }],
        },
      }),
      /название скидки|от 1 до 100|greater than or equal to 1/i
    );

    await priceChangeDocuments.delete({ documentId: updatedPriceChange.documentId });
    const deletedPriceChange = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findOne({
      where: { documentId: updatedPriceChange.documentId },
    });
    assert.equal(deletedPriceChange, null);

    await discountDocuments.delete({ documentId: updatedDiscount.documentId });
    const deletedDiscount = await strapi.db.query(DISCOUNT_UID).findOne({
      where: { documentId: updatedDiscount.documentId },
    });
    assert.equal(deletedDiscount, null);

    await courseDocuments.delete({ documentId: updatedCourse.documentId });
    const deletedCourse = await strapi.db.query(COURSE_UID).findOne({
      where: { documentId: updatedCourse.documentId },
    });
    assert.equal(deletedCourse, null);

    console.log('admin CRUD regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
