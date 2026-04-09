'use strict';

const {
  registerContentTypeLifecycles,
} = require('./bootstrap/register-content-type-lifecycles');
const {
  setupCoursePriceChangeRuntime,
} = require('./bootstrap/course-price-change-runtime');
const { createPublicApiMiddleware } = require('./server/public-api-middleware');
const { createAdminPanelMiddleware } = require('./server/admin-panel-middleware');
const { loadSerializedCourses, checkDatabaseHealth } = require('./server/public-api-services');

const COURSE_PRICE_CHANGE_APPLY_INTERVAL_MS = 10 * 1000;

module.exports = {
  register() {},

  async bootstrap({ strapi }) {
    const { scheduleCoursePriceChangeApply } = await setupCoursePriceChangeRuntime({
      strapi,
      intervalMs: COURSE_PRICE_CHANGE_APPLY_INTERVAL_MS,
    });

    registerContentTypeLifecycles({
      strapi,
      scheduleCoursePriceChangeApply,
    });

    strapi.server.use(createPublicApiMiddleware({
      strapi,
      loadSerializedCourses,
      checkDatabaseHealth,
    }));
    strapi.server.use(createAdminPanelMiddleware({ strapi }));
  },
};
