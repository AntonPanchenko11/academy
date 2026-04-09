'use strict';

const fs = require('fs');
const path = require('path');
const {
  filterCourses,
  resolveSingleCourse,
  serializeCourse,
} = require('./utils/tilda-course');
const {
  COURSE_UID,
  assertCourseIsUnique,
  hasCoursePricingChanges,
  hasCourseUniquenessChanges,
  migrateCourseBasePrice,
  prepareCourseData,
} = require('./utils/course');
const {
  COURSE_PRICE_CHANGE_UID,
  COURSE_PRICE_CHANGES_FIELD,
  applyDueCoursePriceChanges,
  deleteCoursePriceChangesForCourseWhere,
  deleteOrphanedCoursePriceChanges,
  prepareCoursePriceChangeData,
} = require('./utils/course-price-increase');
const {
  DISCOUNT_UID,
  prepareDiscountData,
} = require('./utils/course-discount');
const {
  syncContentManagerConfig,
} = require('./utils/content-manager-config');

const COURSE_PRICE_CHANGE_APPLY_INTERVAL_MS = 10 * 1000;

const toTrimmedString = (value, maxLen = 255) => {
  if (value === undefined || value === null) return '';

  const raw = Array.isArray(value) ? value.find((item) => String(item || '').trim()) : value;
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'object') return '';

  return String(raw).replace(/\s+/g, ' ').trim().slice(0, maxLen);
};

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
  register() {},

  async bootstrap({ strapi }) {
    const buildDir = path.join(strapi.dirs.app.root, 'build');
    const STALE_ADMIN_RELOAD_MODULE = "window.location.replace('/admin'); export default {};";

    const resolveAdminAssetPath = (requestedPath) => {
      const relFromAdmin = requestedPath.replace(/^\/admin\//, '');
      return path.join(buildDir, relFromAdmin);
    };

    const isHashedAdminChunk = (requestedPath) => {
      const fileName = path.basename(requestedPath || '');
      return /-[A-Za-z0-9_-]{6,}\.js$/.test(fileName);
    };

    const sendAdminReloadModule = (ctx) => {
      ctx.type = 'application/javascript; charset=utf-8';
      ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      ctx.set('Pragma', 'no-cache');
      ctx.set('Expires', '0');

      if (ctx.method === 'HEAD') {
        ctx.status = 200;
        return;
      }

      ctx.body = STALE_ADMIN_RELOAD_MODULE;
    };

    try {
      const migration = await migrateCourseBasePrice(strapi);
      if (migration && !migration.skipped) {
        strapi.log.info(`Migrated course.basePrice from legacy price for ${migration.updatedCourses} course(s)`);
      }
    } catch (error) {
      strapi.log.error('Failed to migrate course.basePrice from legacy price', error);
    }

    try {
      const configSync = await syncContentManagerConfig(strapi);
      if (configSync && !configSync.skipped && configSync.updatedKeys.length) {
        strapi.log.info(`Synced content-manager config for ${configSync.updatedKeys.join(', ')}`);
      }
    } catch (error) {
      strapi.log.error('Failed to sync content-manager config', error);
    }

    let isApplyingCoursePriceChanges = false;
    let isShuttingDown = false;
    let currentApplyPromise = null;
    let applyInterval = null;
    const pendingApplyHandles = new Set();

    try {
      const orphanCleanup = await deleteOrphanedCoursePriceChanges(strapi);
      if (orphanCleanup && orphanCleanup.deletedChanges) {
        strapi.log.warn(`Deleted ${orphanCleanup.deletedChanges} orphaned scheduled course price change(s)`);
      }
    } catch (error) {
      strapi.log.error('Failed to delete orphaned scheduled course price changes', error);
    }

    const runCoursePriceChangeApply = async () => {
      if (isShuttingDown || isApplyingCoursePriceChanges) return null;

      isApplyingCoursePriceChanges = true;
      currentApplyPromise = (async () => {
        const result = await applyDueCoursePriceChanges(strapi);
        if (result && result.appliedChanges) {
          strapi.log.info(
            `Applied ${result.appliedChanges} scheduled course price change(s) for ${result.updatedCourses} course(s)`
          );
        }
        return result;
      })();

      try {
        return await currentApplyPromise;
      } finally {
        currentApplyPromise = null;
        isApplyingCoursePriceChanges = false;
      }
    };

    const scheduleCoursePriceChangeApply = (reason) => {
      if (isShuttingDown) return;

      const handle = setImmediate(() => {
        pendingApplyHandles.delete(handle);
        if (isShuttingDown) return;

        runCoursePriceChangeApply().catch((error) => {
          strapi.log.error(`Failed to apply scheduled course price changes ${reason}`, error);
        });
      });

      pendingApplyHandles.add(handle);
    };

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

    try {
      await runCoursePriceChangeApply();
    } catch (error) {
      strapi.log.error('Failed to apply scheduled course price changes on bootstrap', error);
    }

    applyInterval = setInterval(() => {
      if (isShuttingDown) return;

      runCoursePriceChangeApply().catch((error) => {
        strapi.log.error('Failed to apply scheduled course price changes', error);
      });
    }, COURSE_PRICE_CHANGE_APPLY_INTERVAL_MS);
    if (typeof applyInterval.unref === 'function') {
      applyInterval.unref();
    }

    const originalDestroy = strapi.destroy.bind(strapi);
    strapi.destroy = async (...args) => {
      isShuttingDown = true;

      if (applyInterval) {
        clearInterval(applyInterval);
        applyInterval = null;
      }

      for (const handle of pendingApplyHandles) {
        clearImmediate(handle);
      }
      pendingApplyHandles.clear();

      if (currentApplyPromise) {
        try {
          await currentApplyPromise;
        } catch (error) {
          strapi.log.error('Failed to finish scheduled course price changes before shutdown', error);
        }
      }

      return originalDestroy(...args);
    };

    strapi.server.use(async (ctx, next) => {
      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/health/live' || ctx.path === '/api/health/live/')) {
        ctx.status = 200;
        if (ctx.method === 'HEAD') return;

        ctx.body = {
          ok: true,
          service: 'academy-strapi',
          status: 'live',
        };
        return;
      }

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/health/ready' || ctx.path === '/api/health/ready/')) {
        const database = await checkDatabaseHealth(strapi);
        ctx.status = database.ready ? 200 : 503;
        if (ctx.method === 'HEAD') return;

        ctx.body = {
          ok: database.ready,
          service: 'academy-strapi',
          status: database.ready ? 'ready' : 'degraded',
          checks: {
            database,
          },
        };
        return;
      }

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/tilda/health' || ctx.path === '/api/tilda/health/')) {
        const database = await checkDatabaseHealth(strapi);
        ctx.status = database.ready ? 200 : 503;
        if (ctx.method === 'HEAD') return;

        ctx.body = {
          ok: database.ready,
          service: 'tilda-courses',
          checks: {
            database,
          },
        };
        return;
      }

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/tilda/courses' || ctx.path === '/api/tilda/courses/')) {
        if (ctx.method === 'HEAD') {
          ctx.status = 200;
          return;
        }

        try {
          const courses = await loadSerializedCourses(strapi);
          ctx.body = {
            ok: true,
            data: filterCourses(courses, ctx.query || {}),
          };
        } catch (error) {
          strapi.log.error('Failed to load Tilda courses list', error);
          ctx.status = 500;
          ctx.body = { ok: false, error: 'Failed to load courses.' };
        }
        return;
      }

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/tilda/courses/resolve' || ctx.path === '/api/tilda/courses/resolve/')) {
        if (ctx.method === 'HEAD') {
          ctx.status = 200;
          return;
        }

        try {
          const courses = await loadSerializedCourses(strapi);
          const course = resolveSingleCourse(courses, ctx.query || {});

          if (!course) {
            ctx.status = 404;
            ctx.body = { ok: false, error: 'Course not found.' };
            return;
          }

          ctx.body = { ok: true, data: course };
        } catch (error) {
          strapi.log.error('Failed to resolve Tilda course', error);
          ctx.status = 500;
          ctx.body = { ok: false, error: 'Failed to resolve course.' };
        }
        return;
      }

      const singleCourseMatch = ctx.path.match(/^\/api\/tilda\/courses\/([^/]+)\/?$/);
      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && singleCourseMatch && singleCourseMatch[1] !== 'resolve') {
        if (ctx.method === 'HEAD') {
          ctx.status = 200;
          return;
        }

        try {
          const identifier = decodeURIComponent(singleCourseMatch[1]);
          const courses = await loadSerializedCourses(strapi);
          const course = resolveSingleCourse(courses, ctx.query || {}, identifier);

          if (!course) {
            ctx.status = 404;
            ctx.body = { ok: false, error: 'Course not found.' };
            return;
          }

          ctx.body = { ok: true, data: course };
        } catch (error) {
          strapi.log.error('Failed to load Tilda course', error);
          ctx.status = 500;
          ctx.body = { ok: false, error: 'Failed to load course.' };
        }
        return;
      }

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/courses-feed' || ctx.path === '/api/courses-feed/')) {
        try {
          const courses = await loadSerializedCourses(strapi);
          const published = courses.filter((course) => course.publish !== false);
          ctx.body = { data: published };
        } catch (error) {
          strapi.log.error('Failed to load courses-feed', error);
          ctx.status = 500;
          ctx.body = { error: 'Failed to load courses feed' };
        }
        return;
      }

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && ctx.path.startsWith('/admin/') && ctx.path.endsWith('.js')) {
        const filePath = resolveAdminAssetPath(ctx.path);
        if (fs.existsSync(filePath)) {
          ctx.type = 'application/javascript; charset=utf-8';
          if (ctx.method === 'HEAD') {
            ctx.status = 200;
            return;
          }
          ctx.body = fs.createReadStream(filePath);
          return;
        }

        if (ctx.path.startsWith('/admin/node_modules/.strapi/vite/deps/') || isHashedAdminChunk(ctx.path)) {
          sendAdminReloadModule(ctx);
          return;
        }
      }

      await next();

      if (ctx.method === 'GET' && ctx.path.startsWith('/admin') && String(ctx.response.type || '').includes('text/html')) {
        ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        ctx.set('Pragma', 'no-cache');
        ctx.set('Expires', '0');
      }
    });
  },
};
