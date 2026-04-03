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
  PRICING_SETTINGS_UID,
  buildCoursePriceIncreaseInfo,
  getUpcomingScheduledIncreases,
  migrateCoursePriceToInteger,
  loadPricingSettings,
  prepareCoursePricingData,
  repairPricingSettingsComponents,
  sanitizePricingSettingsData,
  syncPricingState,
} = require('./utils/pricing');

const PRICING_SYNC_INTERVAL_MS = 60 * 1000;

const toTrimmedString = (value, maxLen = 255) => {
  if (value === undefined || value === null) return '';

  const raw = Array.isArray(value) ? value.find((item) => String(item || '').trim()) : value;
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'object') return '';

  return String(raw).replace(/\s+/g, ' ').trim().slice(0, maxLen);
};

const loadSerializedCourses = async (strapi) => {
  const courses = await strapi.db.query('api::course.course').findMany({
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
  });

  return courses.map(serializeCourse);
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
      const migration = await migrateCoursePriceToInteger(strapi);
      if (migration && !migration.skipped) {
        strapi.log.info(`Migrated course.price to integer for ${migration.updatedCourses} course(s)`);
      }
    } catch (error) {
      strapi.log.error('Failed to migrate course.price to integer', error);
    }

    strapi.db.lifecycles.subscribe({
      models: [COURSE_UID],
      async beforeCreate(event) {
        event.params.data = {
          ...(event.params.data || {}),
          ...(await prepareCoursePricingData(strapi, event.params.data || {}, null)),
        };
      },
      async beforeUpdate(event) {
        event.params.data = {
          ...(event.params.data || {}),
          ...(await prepareCoursePricingData(strapi, event.params.data || {}, event.params.where || null)),
        };
      },
    });

    strapi.db.lifecycles.subscribe({
      models: [PRICING_SETTINGS_UID],
      async beforeCreate(event) {
        event.params.data = await sanitizePricingSettingsData(strapi, event.params.data || {}, null);
      },
      async beforeUpdate(event) {
        event.params.data = await sanitizePricingSettingsData(strapi, event.params.data || {}, null);
      },
      async afterCreate(event) {
        if (event && event.result && event.result.id) {
          await repairPricingSettingsComponents(strapi, event.result.id);
          setTimeout(() => {
            repairPricingSettingsComponents(strapi, event.result.id).catch((error) => {
              strapi.log.error('Failed to repair pricing settings components after create', error);
            });
          }, 250);
        }
        await syncPricingState(strapi);
      },
      async afterUpdate(event) {
        if (event && event.result && event.result.id) {
          await repairPricingSettingsComponents(strapi, event.result.id);
          setTimeout(() => {
            repairPricingSettingsComponents(strapi, event.result.id).catch((error) => {
              strapi.log.error('Failed to repair pricing settings components after update', error);
            });
          }, 250);
        }
        await syncPricingState(strapi);
      },
    });

    syncPricingState(strapi).catch((error) => {
      strapi.log.error('Failed to sync course pricing on bootstrap', error);
    });

    setInterval(() => {
      syncPricingState(strapi).catch((error) => {
        strapi.log.error('Failed to sync scheduled course pricing', error);
      });
    }, PRICING_SYNC_INTERVAL_MS);

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

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/tilda/pricing' || ctx.path === '/api/tilda/pricing/')) {
        if (ctx.method === 'HEAD') {
          ctx.status = 200;
          return;
        }

        try {
          const settings = await loadPricingSettings(strapi);
          const upcomingIncreases = getUpcomingScheduledIncreases(settings);

          ctx.body = {
            ok: true,
            data: {
              nextIncrease: upcomingIncreases[0] || null,
              upcomingIncreases,
            },
          };
        } catch (error) {
          strapi.log.error('Failed to load Tilda pricing settings', error);
          ctx.status = 500;
          ctx.body = { ok: false, error: 'Failed to load pricing settings.' };
        }
        return;
      }

      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/api/tilda/pricing/resolve' || ctx.path === '/api/tilda/pricing/resolve/')) {
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

          const settings = await loadPricingSettings(strapi);
          ctx.body = {
            ok: true,
            data: {
              course,
              pricing: buildCoursePriceIncreaseInfo(course, settings),
            },
          };
        } catch (error) {
          strapi.log.error('Failed to resolve Tilda pricing info', error);
          ctx.status = 500;
          ctx.body = { ok: false, error: 'Failed to resolve pricing info.' };
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
