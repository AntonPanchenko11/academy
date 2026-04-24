'use strict';

const { filterCourses, resolveSingleCourse } = require('../utils/tilda-course');

const isReadMethod = (method) => method === 'GET' || method === 'HEAD';

const matchesExactPath = (ctx, path) => ctx.path === path || ctx.path === `${path}/`;

const pickDefined = (entries) => {
  return entries.reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

const createAllowedQueryBuilder = (allowedKeys = []) => {
  return (query = {}) => {
    return pickDefined(
      allowedKeys.map((key) => [key, query[key]])
    );
  };
};

const createIdentifierQueryBuilder = (allowedKeys = [], identifierKey = '') => {
  return (query = {}, identifier) => {
    const entries = allowedKeys.map((key) => [key, query[key]]);
    const identifierValue = identifier === undefined || identifier === null || identifier === ''
      ? query[identifierKey]
      : identifier;

    if (identifierKey) {
      entries.push([identifierKey, identifierValue]);
    }

    return pickDefined(entries);
  };
};

const logPublicApiError = (strapi, namespace, action, error) => {
  if (!strapi || !strapi.log || typeof strapi.log.error !== 'function') return;

  const safeNamespace = namespace || 'unknown';
  const safeAction = action || 'request';
  strapi.log.error(`[public-api:${safeNamespace}] Failed to ${safeAction}`, error);
};

const respondWithCourseList = async (ctx, {
  strapi,
  loadSerializedCourses,
  query,
  namespace,
  action,
  errorMessage,
}) => {
  if (ctx.method === 'HEAD') {
    ctx.status = 200;
    return;
  }

  try {
    const courses = await loadSerializedCourses(strapi);
    ctx.body = {
      ok: true,
      data: filterCourses(courses, query),
    };
  } catch (error) {
    logPublicApiError(strapi, namespace, action, error);
    ctx.status = 500;
    ctx.body = { ok: false, error: errorMessage };
  }
};

const respondWithSingleCourse = async (ctx, {
  strapi,
  loadSerializedCourses,
  query,
  identifier,
  namespace,
  action,
  errorMessage,
  resolver,
}) => {
  if (ctx.method === 'HEAD') {
    ctx.status = 200;
    return;
  }

  try {
    const courses = await loadSerializedCourses(strapi);
    const resolve = typeof resolver === 'function' ? resolver : resolveSingleCourse;
    const course = resolve(courses, query, identifier);

    if (!course) {
      ctx.status = 404;
      ctx.body = { ok: false, error: 'Course not found.' };
      return;
    }

    ctx.body = { ok: true, data: course };
  } catch (error) {
    logPublicApiError(strapi, namespace, action, error);
    ctx.status = 500;
    ctx.body = { ok: false, error: errorMessage };
  }
};

const createCourseNamespaceHandlers = ({
  strapi,
  loadSerializedCourses,
  listQueryBuilder,
  resolveQueryBuilder,
  singleQueryBuilder,
  resolveResolver,
  singleResolver,
  namespace,
  listErrorMessage = 'Failed to load courses.',
  resolveErrorMessage = 'Failed to resolve course.',
  singleErrorMessage = 'Failed to load course.',
}) => {
  return {
    async respondList(ctx) {
      return respondWithCourseList(ctx, {
        strapi,
        loadSerializedCourses,
        query: typeof listQueryBuilder === 'function' ? listQueryBuilder(ctx.query || {}) : (ctx.query || {}),
        namespace,
        action: 'load course list',
        errorMessage: listErrorMessage,
      });
    },
    async respondResolve(ctx) {
      return respondWithSingleCourse(ctx, {
        strapi,
        loadSerializedCourses,
        query: typeof resolveQueryBuilder === 'function' ? resolveQueryBuilder(ctx.query || {}) : (ctx.query || {}),
        identifier: '',
        namespace,
        action: 'resolve course',
        errorMessage: resolveErrorMessage,
        resolver: resolveResolver,
      });
    },
    async respondSingle(ctx, identifier) {
      return respondWithSingleCourse(ctx, {
        strapi,
        loadSerializedCourses,
        query: typeof singleQueryBuilder === 'function' ? singleQueryBuilder(ctx.query || {}, identifier) : (ctx.query || {}),
        identifier,
        namespace,
        action: 'load course',
        errorMessage: singleErrorMessage,
        resolver: singleResolver,
      });
    },
  };
};

module.exports = {
  createAllowedQueryBuilder,
  createCourseNamespaceHandlers,
  createIdentifierQueryBuilder,
  isReadMethod,
  logPublicApiError,
  matchesExactPath,
};
