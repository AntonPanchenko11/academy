'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createStrapi } = require('@strapi/strapi');

const { serializeCourse } = require('../src/utils/tilda-course');
const {
  APP_DIR,
  createTempDatabaseCopy,
  loadEnvFile,
} = require('./lib/strapi-script-helpers');

const listDiscountLinks = async (strapi) => {
  return strapi.db.connection('courses_discount_lnk')
    .select(['course_id', 'discount_id'])
    .orderBy([
      { column: 'course_id', order: 'asc' },
      { column: 'discount_id', order: 'asc' },
    ]);
};

const serializeStoredCourse = async (strapi, courseId) => {
  const course = await strapi.db.query('api::course.course').findOne({
    where: { id: courseId },
    populate: {
      discount: true,
      priceChanges: true,
    },
  });

  return serializeCourse(course);
};

const createCourse = async (documents, suffix, name, basePrice) => {
  return documents.create({
    data: {
      title: `${name} ${suffix}`,
      publish: true,
      courseStatus: 'Идет набор',
      courseLink: `https://example.com/${name.toLowerCase().replace(/\s+/g, '-')}-${suffix}`,
      basePrice,
    },
  });
};

const main = async () => {
  loadEnvFile();

  const { tempDir, tempDbPath } = createTempDatabaseCopy('academy-discount-regression-');
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

    const courseDocuments = strapi.documents('api::course.course');
    const discountDocuments = strapi.documents('api::discount.discount');
    const suffix = String(Date.now());

    const courseA = await createCourse(courseDocuments, suffix, 'Discount Course A', 1000);
    const courseB = await createCourse(courseDocuments, suffix, 'Discount Course B', 2000);
    const courseC = await createCourse(courseDocuments, suffix, 'Discount Course C', 3000);

    const discountA = await discountDocuments.create({
      data: {
        title: `Discount A ${suffix}`,
        percent: 15,
        active: true,
        comment: 'created by regression',
        courses: [{ id: courseA.id }, { id: courseB.id }],
      },
      populate: {
        courses: true,
      },
    });

    assert.deepEqual(
      discountA.courses.map((course) => course.id).sort((left, right) => left - right),
      [courseA.id, courseB.id]
    );
    assert.deepEqual(
      await listDiscountLinks(strapi),
      [
        { course_id: courseA.id, discount_id: discountA.id },
        { course_id: courseB.id, discount_id: discountA.id },
      ]
    );

    const serializedCourseAWithDiscountA = await serializeStoredCourse(strapi, courseA.id);
    assert.equal(serializedCourseAWithDiscountA.discountPercent, 15);
    assert.equal(serializedCourseAWithDiscountA.price, 850);

    const updatedDiscountA = await discountDocuments.update({
      documentId: discountA.documentId,
      data: {
        percent: 20,
        active: false,
        comment: 'updated by regression',
        courses: [{ id: courseA.id }, { id: courseC.id }],
      },
      populate: {
        courses: true,
      },
    });

    assert.equal(updatedDiscountA.percent, 20);
    assert.equal(updatedDiscountA.active, false);
    assert.equal(updatedDiscountA.comment, 'updated by regression');
    assert.deepEqual(
      updatedDiscountA.courses.map((course) => course.id).sort((left, right) => left - right),
      [courseA.id, courseC.id]
    );
    assert.deepEqual(
      await listDiscountLinks(strapi),
      [
        { course_id: courseA.id, discount_id: discountA.id },
        { course_id: courseC.id, discount_id: discountA.id },
      ]
    );

    const serializedCourseAWithInactiveDiscount = await serializeStoredCourse(strapi, courseA.id);
    const serializedCourseBWithoutDiscount = await serializeStoredCourse(strapi, courseB.id);
    assert.equal(serializedCourseAWithInactiveDiscount.discountPercent, 0);
    assert.equal(serializedCourseAWithInactiveDiscount.price, 1000);
    assert.equal(serializedCourseAWithInactiveDiscount.activeDiscount, null);
    assert.equal(serializedCourseBWithoutDiscount.activeDiscount, null);

    const discountB = await discountDocuments.create({
      data: {
        title: `Discount B ${suffix}`,
        percent: 30,
        active: true,
        courses: [{ id: courseA.id }],
      },
      populate: {
        courses: true,
      },
    });

    assert.deepEqual(
      await listDiscountLinks(strapi),
      [
        { course_id: courseA.id, discount_id: discountB.id },
        { course_id: courseC.id, discount_id: discountA.id },
      ]
    );

    const storedDiscountAAfterReassign = await strapi.db.query('api::discount.discount').findOne({
      where: { id: discountA.id },
      populate: { courses: true },
    });
    const storedDiscountBAfterReassign = await strapi.db.query('api::discount.discount').findOne({
      where: { id: discountB.id },
      populate: { courses: true },
    });
    assert.deepEqual(storedDiscountAAfterReassign.courses.map((course) => course.id), [courseC.id]);
    assert.deepEqual(storedDiscountBAfterReassign.courses.map((course) => course.id), [courseA.id]);

    const serializedCourseAWithDiscountB = await serializeStoredCourse(strapi, courseA.id);
    assert.equal(serializedCourseAWithDiscountB.discountPercent, 30);
    assert.equal(serializedCourseAWithDiscountB.price, 700);
    assert.equal(serializedCourseAWithDiscountB.activeDiscount.percent, 30);

    await discountDocuments.delete({ documentId: discountB.documentId });

    assert.deepEqual(
      await listDiscountLinks(strapi),
      [{ course_id: courseC.id, discount_id: discountA.id }]
    );
    const serializedCourseAAfterDeleteDiscountB = await serializeStoredCourse(strapi, courseA.id);
    assert.equal(serializedCourseAAfterDeleteDiscountB.activeDiscount, null);

    await discountDocuments.delete({ documentId: discountA.documentId });

    assert.deepEqual(await listDiscountLinks(strapi), []);
    const serializedCourseCAfterDeleteDiscountA = await serializeStoredCourse(strapi, courseC.id);
    assert.equal(serializedCourseCAfterDeleteDiscountA.activeDiscount, null);

    await courseDocuments.delete({ documentId: courseA.documentId });
    await courseDocuments.delete({ documentId: courseB.documentId });
    await courseDocuments.delete({ documentId: courseC.documentId });

    console.log('discount regression check passed');
  } finally {
    await strapi.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
