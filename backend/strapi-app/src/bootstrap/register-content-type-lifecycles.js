'use strict';

const {
  COURSE_UID,
  assertCourseIsUnique,
  hasCoursePricingChanges,
  hasCourseUniquenessChanges,
  prepareCourseData,
} = require('../utils/course');
const {
  COURSE_PRICE_CHANGE_UID,
  deleteCoursePriceChangesForCourseWhere,
  prepareCoursePriceChangeData,
} = require('../utils/course-price-increase');
const {
  DISCOUNT_UID,
  prepareDiscountData,
} = require('../utils/course-discount');

const registerContentTypeLifecycles = ({ strapi, scheduleCoursePriceChangeApply }) => {
  strapi.db.lifecycles.subscribe({
    models: [COURSE_UID],
    async beforeCreate(event) {
      await assertCourseIsUnique(strapi, event.params.data || {}, null);
      event.params.data = {
        ...(event.params.data || {}),
        ...(await prepareCourseData(strapi, event.params.data || {}, null)),
      };
    },
    async beforeUpdate(event) {
      const data = event.params.data || {};

      if (hasCourseUniquenessChanges(data)) {
        await assertCourseIsUnique(strapi, data, event.params.where || null);
      }

      if (hasCoursePricingChanges(data)) {
        event.params.data = {
          ...data,
          ...(await prepareCourseData(strapi, data, event.params.where || null)),
        };
      }
    },
    async beforeDelete(event) {
      await deleteCoursePriceChangesForCourseWhere(strapi, event.params.where || null);
    },
  });

  strapi.db.lifecycles.subscribe({
    models: [COURSE_PRICE_CHANGE_UID],
    async beforeCreate(event) {
      event.params.data = await prepareCoursePriceChangeData(strapi, event.params.data || {}, null);
    },
    async beforeUpdate(event) {
      event.params.data = await prepareCoursePriceChangeData(
        strapi,
        event.params.data || {},
        event.params.where || null
      );
    },
    async afterCreate() {
      scheduleCoursePriceChangeApply('after create');
    },
    async afterUpdate() {
      scheduleCoursePriceChangeApply('after update');
    },
  });

  strapi.db.lifecycles.subscribe({
    models: [DISCOUNT_UID],
    async beforeCreate(event) {
      event.params.data = await prepareDiscountData(strapi, event.params.data || {}, null);
    },
    async beforeUpdate(event) {
      event.params.data = await prepareDiscountData(
        strapi,
        event.params.data || {},
        event.params.where || null
      );
    },
  });
};

module.exports = {
  registerContentTypeLifecycles,
};
