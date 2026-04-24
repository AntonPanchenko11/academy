'use strict';

const {
  resolveCourseByPath,
  resolveCourseBySlug,
} = require('../utils/tilda-course');
const {
  buildCourseSeoPayload,
  buildRobotsTxt,
  buildSitemapXml,
  parseSeoStaticPaths,
} = require('./public-api-services');
const {
  createAllowedQueryBuilder,
  createCourseNamespaceHandlers,
  createIdentifierQueryBuilder,
  isReadMethod,
  logPublicApiError,
  matchesExactPath,
} = require('./public-course-api');

const buildCourseSeoContext = ({
  publicUrl,
  siteName,
  titleSuffix,
  defaultDescription,
  course,
}) => {
  return buildCourseSeoPayload({
    publicUrl,
    siteName,
    titleSuffix,
    defaultDescription,
    course,
  });
};

const createPublicApiMiddleware = ({ strapi, loadSerializedCourses, checkDatabaseHealth }) => {
  const tildaCourses = createCourseNamespaceHandlers({
    strapi,
    loadSerializedCourses,
    listQueryBuilder: (query = {}) => query,
    resolveQueryBuilder: (query = {}) => query,
    singleQueryBuilder: (query = {}) => query,
    namespace: 'tilda',
  });

  const publicCourses = createCourseNamespaceHandlers({
    strapi,
    loadSerializedCourses,
    listQueryBuilder: createAllowedQueryBuilder(['fields', 'search', 'q', 'waitlist']),
    resolveQueryBuilder: createIdentifierQueryBuilder(['fields'], 'path'),
    singleQueryBuilder: createIdentifierQueryBuilder(['fields'], 'slug'),
    resolveResolver: resolveCourseByPath,
    singleResolver: resolveCourseBySlug,
    namespace: 'webstudio',
  });

  const respondWithCourseSeo = async (ctx, resolver, query, identifier) => {
    if (ctx.method === 'HEAD') {
      ctx.status = 200;
      return;
    }

    try {
      const courses = await loadSerializedCourses(strapi);
      const course = resolver(courses, query, identifier);

      if (!course || course.publish === false) {
        ctx.status = 404;
        ctx.body = { ok: false, error: 'Course not found.' };
        return;
      }

      ctx.body = {
        ok: true,
        data: buildCourseSeoContext({
          publicUrl: process.env.PUBLIC_URL,
          siteName: process.env.SEO_SITE_NAME,
          titleSuffix: process.env.SEO_TITLE_SUFFIX,
          defaultDescription: process.env.SEO_DEFAULT_DESCRIPTION,
          course,
        }),
      };
    } catch (error) {
      logPublicApiError(strapi, 'seo', 'build course seo payload', error);
      ctx.status = 500;
      ctx.body = { ok: false, error: 'Failed to build course SEO metadata.' };
    }
  };

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

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/public/courses')) {
      await publicCourses.respondList(ctx);
      return;
    }

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/public/courses/resolve')) {
      await publicCourses.respondResolve(ctx);
      return;
    }

    if (isReadMethod(ctx.method) && matchesExactPath(ctx, '/api/public/seo/courses/resolve')) {
      await respondWithCourseSeo(
        ctx,
        resolveCourseByPath,
        createIdentifierQueryBuilder([], 'path')(ctx.query || {}),
        ''
      );
      return;
    }

    const publicCourseMatch = ctx.path.match(/^\/api\/public\/courses\/([^/]+)\/?$/);
    if (isReadMethod(ctx.method) && publicCourseMatch && publicCourseMatch[1] !== 'resolve') {
      await publicCourses.respondSingle(ctx, decodeURIComponent(publicCourseMatch[1]));
      return;
    }

    const publicCourseSeoMatch = ctx.path.match(/^\/api\/public\/seo\/courses\/([^/]+)\/?$/);
    if (isReadMethod(ctx.method) && publicCourseSeoMatch && publicCourseSeoMatch[1] !== 'resolve') {
      await respondWithCourseSeo(
        ctx,
        resolveCourseBySlug,
        createIdentifierQueryBuilder([], 'slug')(ctx.query || {}, decodeURIComponent(publicCourseSeoMatch[1])),
        decodeURIComponent(publicCourseSeoMatch[1])
      );
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
