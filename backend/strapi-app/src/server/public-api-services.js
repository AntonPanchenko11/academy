'use strict';

const { serializeCourse } = require('../utils/tilda-course');
const { COURSE_PRICE_CHANGES_FIELD } = require('../utils/course-price-increase');
const { toTrimmedString } = require('../utils/course-reference');

const loadSerializedCourses = async (strapi) => {
  const courses = await strapi.db.query('api::course.course').findMany({
    populate: {
      discount: true,
      [COURSE_PRICE_CHANGES_FIELD]: true,
    },
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
  });

  return courses.map((course) => serializeCourse(course));
};

const checkDatabaseHealth = async (strapi) => {
  try {
    await strapi.db.connection.raw('select 1');
    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      error: toTrimmedString(error && error.message, 500) || 'Database is unavailable.',
    };
  }
};

module.exports = {
  checkDatabaseHealth,
  loadSerializedCourses,
};
