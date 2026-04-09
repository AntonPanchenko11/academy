'use strict';

const { errors } = require('@strapi/utils');

const COURSE_UID = 'api::course.course';
const { ValidationError } = errors;

const toTrimmedString = (value, maxLen = 255) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return '';

  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLen);
};

const parseInteger = (value) => {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  const digits = String(value).replace(/[^\d-]/g, '');
  if (!digits) return null;

  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePlainInteger = (value) => {
  if (typeof value === 'number') {
    return parseInteger(value);
  }

  const raw = toTrimmedString(value, 255);
  if (!raw || !/^-?\d[\d\s]*$/.test(raw)) return null;

  return parseInteger(raw);
};

const normalizePathname = (value) => {
  const text = toTrimmedString(value, 1000);
  if (!text) return '';

  const withoutHost = text.replace(/^https?:\/\/[^/]+/i, '');
  const beforeHash = withoutHost.split('#')[0];
  const beforeQuery = beforeHash.split('?')[0];
  const path = beforeQuery.startsWith('/') ? beforeQuery : `/${beforeQuery}`;

  return path
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '') || '/';
};

const normalizeAbsoluteUrl = (value) => {
  const text = toTrimmedString(value, 1000);
  if (!text) return '';

  try {
    const parsed = new URL(text);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = normalizePathname(parsed.pathname);
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch (error) {
    return '';
  }
};

const normalizeCourseLinkIdentity = (value) => {
  const normalizedUrl = normalizeAbsoluteUrl(value);
  if (normalizedUrl) return `url:${normalizedUrl}`;

  const normalizedPath = normalizePathname(value).toLowerCase();
  if (normalizedPath && normalizedPath !== '/') return `path:${normalizedPath}`;

  const raw = toTrimmedString(value, 1000).toLowerCase();
  return raw ? `raw:${raw}` : '';
};

const buildCourseUniquenessKey = (course = {}) => {
  const linkKey = normalizeCourseLinkIdentity(course.courseLink);
  const date = toTrimmedString(course.date, 32);
  const title = toTrimmedString(course.title, 255).toLowerCase();
  const waitlist = course.waitlist === true ? '1' : '0';

  if (linkKey && date) return `${linkKey}::${date}::${waitlist}`;
  if (linkKey && title) return `${linkKey}::${title}::${waitlist}`;
  if (title && date) return `title:${title}::${date}::${waitlist}`;

  return '';
};

const loadEntityByWhere = async (strapi, uid, where, populate = undefined) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id !== undefined && where.id !== null) {
    return strapi.db.query(uid).findOne({
      where: { id: where.id },
      ...(populate ? { populate } : {}),
    });
  }

  if (where.documentId) {
    return strapi.db.query(uid).findOne({
      where: { documentId: where.documentId },
      ...(populate ? { populate } : {}),
    });
  }

  return null;
};

const resolveCourseBasePrice = (input = {}, existingCourse = null) => {
  const current = {
    ...(existingCourse || {}),
    ...(input || {}),
  };

  const explicitBasePrice = parseInteger(current.basePrice);
  const plainBasePrice = parsePlainInteger(current.basePrice);
  const existingBasePrice = existingCourse ? parseInteger(existingCourse.basePrice) : null;
  const legacyPrice = parseInteger(current.price);
  const nextBasePrice = explicitBasePrice
    ?? plainBasePrice
    ?? existingBasePrice
    ?? legacyPrice;

  return Number.isFinite(nextBasePrice) ? Math.max(0, nextBasePrice) : null;
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const hasCoursePricingChanges = (data = {}) => {
  return hasOwn(data, 'basePrice')
    || hasOwn(data, 'price');
};

const hasCourseUniquenessChanges = (data = {}) => {
  return hasOwn(data, 'title')
    || hasOwn(data, 'courseLink')
    || hasOwn(data, 'date')
    || hasOwn(data, 'waitlist');
};

const prepareCourseData = async (strapi, data, where) => {
  const existingCourse = await loadEntityByWhere(strapi, COURSE_UID, where);
  const nextData = {
    ...(data || {}),
  };

  delete nextData.price;

  if (!hasOwn(nextData, 'basePrice') && !hasOwn(data, 'price')) {
    return nextData;
  }

  return {
    ...nextData,
    basePrice: resolveCourseBasePrice(nextData, existingCourse),
  };
};

const assertCourseIsUnique = async (strapi, data, where = null) => {
  const existingCourse = await loadEntityByWhere(strapi, COURSE_UID, where);
  const candidate = {
    ...(existingCourse || {}),
    ...(data || {}),
  };
  const candidateKey = buildCourseUniquenessKey(candidate);
  if (!candidateKey) return;

  const existingKey = buildCourseUniquenessKey(existingCourse || {});
  if (existingCourse && existingKey === candidateKey) {
    return;
  }

  const currentCourseId = parseInteger(existingCourse && existingCourse.id);
  const courses = await strapi.db.query(COURSE_UID).findMany({
    orderBy: [{ id: 'asc' }],
  });

  const duplicate = courses.find((course) => {
    const courseId = parseInteger(course && course.id);
    if (Number.isFinite(currentCourseId) && courseId === currentCourseId) return false;

    return buildCourseUniquenessKey(course) === candidateKey;
  });

  if (!duplicate) return;

  throw new ValidationError(
    `Курс "${toTrimmedString(candidate.title, 255) || 'без названия'}" уже существует `
    + 'для этой даты/ссылки. Используйте существующую запись вместо повторного создания.'
  );
};

const columnExists = async (strapi, tableName, columnName) => {
  const result = await strapi.db.connection.raw(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = ?
      AND column_name = ?
    LIMIT 1
  `, [tableName, columnName]);

  const rows = Array.isArray(result && result.rows)
    ? result.rows
    : Array.isArray(result)
      ? result
      : [];

  return rows.length > 0;
};

const migrateCourseBasePrice = async (strapi) => {
  const clientName = toTrimmedString(
    strapi && strapi.db && strapi.db.connection && strapi.db.connection.client && strapi.db.connection.client.config
      ? strapi.db.connection.client.config.client
      : '',
    40
  ).toLowerCase();

  if (!clientName || clientName.includes('sqlite')) {
    return { skipped: true, reason: 'unsupported-client' };
  }

  const hasBasePriceColumn = await columnExists(strapi, 'courses', 'base_price');
  if (!hasBasePriceColumn) {
    return { skipped: true, reason: 'missing-base-price-column' };
  }

  const hasPriceColumn = await columnExists(strapi, 'courses', 'price');
  if (!hasPriceColumn) {
    return { skipped: true, reason: 'missing-legacy-price-column' };
  }

  const courses = await strapi.db.connection('courses')
    .select(['id', 'price', 'base_price'])
    .orderBy([{ column: 'id', order: 'asc' }]);

  let updatedCourses = 0;

  for (const course of courses) {
    const currentBasePrice = parseInteger(course && course.base_price);
    if (Number.isFinite(currentBasePrice)) continue;

    const nextBasePrice = parseInteger(course && course.price);
    if (!Number.isFinite(nextBasePrice)) continue;

    await strapi.db.connection('courses')
      .where({ id: course.id })
      .update({ base_price: nextBasePrice });

    updatedCourses += 1;
  }

  return {
    skipped: false,
    updatedCourses,
  };
};

module.exports = {
  COURSE_UID,
  assertCourseIsUnique,
  hasCoursePricingChanges,
  hasCourseUniquenessChanges,
  migrateCourseBasePrice,
  prepareCourseData,
};
