'use strict';

const {
  buildRobotsTxt,
  buildSitemapXml,
  parseSeoStaticPaths,
} = require('./public-api-services');
const {
  createCourseNamespaceHandlers,
  isReadMethod,
  logPublicApiError,
  matchesExactPath,
} = require('./public-course-api');

const createPublicApiMiddleware = ({ strapi, loadSerializedCourses, checkDatabaseHealth }) => {
  const tildaCourses = createCourseNamespaceHandlers({
    strapi,
    loadSerializedCourses,
    listQueryBuilder: (query = {}) => query,
    resolveQueryBuilder: (query = {}) => query,
    singleQueryBuilder: (query = {}) => query,
    namespace: 'tilda',
  });

  return async (ctx, next) => {
    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/health/live')) {
      ctx.status = 200;
      if (ctx.method === 'HEAD') return;

      ctx.body = {
        ok: true,
        service: 'academy-strapi',
        status: 'live',
      };
      return;
    }

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/health/ready')) {
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

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/tilda/health')) {
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

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/robots.txt')) {
      ctx.status = 200;
      ctx.response.type = 'text/plain; charset=utf-8';
      if (ctx.method === 'HEAD') return;

      ctx.body = buildRobotsTxt({
        publicUrl: process.env.PUBLIC_URL,
      });
      return;
    }

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/sitemap.xml')) {
      try {
        const courses = await loadSerializedCourses(strapi);
        ctx.status = 200;
        ctx.response.type = 'application/xml; charset=utf-8';
        if (ctx.method === 'HEAD') return;

        ctx.body = buildSitemapXml({
          publicUrl: process.env.PUBLIC_URL,
          staticPaths: parseSeoStaticPaths(process.env.SEO_STATIC_PATHS),
          courses,
        });
      } catch (error) {
        logPublicApiError(strapi, 'seo', 'build sitemap.xml', error);
        ctx.status = 500;
        ctx.body = 'Failed to build sitemap.';
      }
      return;
    }

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/tilda/courses')) {
      await tildaCourses.respondList(ctx);
      return;
    }

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/tilda/courses/resolve')) {
      await tildaCourses.respondResolve(ctx);
      return;
    }

    const singleCourseMatch = ctx.path.match(/^\/api\/tilda\/courses\/([^/]+)\/?$/);
    if (isReadMethod(ctx.method) && singleCourseMatch && singleCourseMatch[1] !== 'resolve') {
      await tildaCourses.respondSingle(ctx, decodeURIComponent(singleCourseMatch[1]));
      return;
    }

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/courses-feed')) {
      try {
        const courses = await loadSerializedCourses(strapi);
        const published = courses.filter((course) => course.publish !== false);
        ctx.body = { data: published };
      } catch (error) {
        logPublicApiError(strapi, 'schedule', 'load courses-feed', error);
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
