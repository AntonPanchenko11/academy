'use strict';

const {
  filterCourses,
  resolveSingleCourse,
} = require('../utils/tilda-course');

const createPublicApiMiddleware = ({ strapi, loadSerializedCourses, checkDatabaseHealth }) => {
  return async (ctx, next) => {
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

    await next();
  };
};

module.exports = {
  createPublicApiMiddleware,
};
