'use strict';

const { errors } = require('@strapi/utils');

const { ValidationError } = errors;
const COURSE_UID = 'api::course.course';
const DISCOUNT_UID = 'api::discount.discount';

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

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;

  const raw = toTrimmedString(value, 20).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
};

const extractCourseRefs = (value) => {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && value.connect !== undefined
      ? value.connect
      : value && typeof value === 'object' && value.set !== undefined
        ? value.set
        : value
          ? [value]
          : [];

  const seen = new Set();

  return source
    .map((item) => {
      if (typeof item === 'number' || typeof item === 'string') {
        const id = parseInteger(item);
        const documentId = Number.isFinite(id) ? '' : toTrimmedString(item, 120);
        return {
          id: Number.isFinite(id) ? id : null,
          documentId: documentId || null,
        };
      }

      if (!item || typeof item !== 'object') return null;

      const id = parseInteger(item.id);
      const documentId = toTrimmedString(item.documentId, 120);
      if (!Number.isFinite(id) && !documentId) return null;

      return {
        id: Number.isFinite(id) ? id : null,
        documentId: documentId || null,
      };
    })
    .filter((item) => {
      if (!item) return false;

      const key = Number.isFinite(item.id) ? `id:${item.id}` : `documentId:${item.documentId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const loadCourseByRef = async (strapi, courseRef) => {
  const courseId = parseInteger(courseRef && courseRef.id);
  if (Number.isFinite(courseId)) {
    return strapi.db.query(COURSE_UID).findOne({
      where: { id: courseId },
    });
  }

  const documentId = toTrimmedString(courseRef && courseRef.documentId, 120);
  if (documentId) {
    return strapi.db.query(COURSE_UID).findOne({
      where: { documentId },
    });
  }

  return null;
};

const resolveCourseIds = async (strapi, value) => {
  const refs = extractCourseRefs(value);
  const resolvedIds = [];

  for (const ref of refs) {
    const directId = parseInteger(ref && ref.id);
    if (Number.isFinite(directId)) {
      resolvedIds.push(directId);
      continue;
    }

    const course = await loadCourseByRef(strapi, ref);
    const courseId = parseInteger(course && course.id);
    if (Number.isFinite(courseId)) {
      resolvedIds.push(courseId);
    }
  }

  return Array.from(new Set(resolvedIds));
};

const loadDiscountByWhere = async (strapi, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id !== undefined && where.id !== null) {
    return strapi.db.query(DISCOUNT_UID).findOne({
      where: { id: where.id },
      populate: {
        courses: true,
      },
    });
  }

  if (where.documentId) {
    return strapi.db.query(DISCOUNT_UID).findOne({
      where: { documentId: where.documentId },
      populate: {
        courses: true,
      },
    });
  }

  return null;
};

const serializeDiscount = (discount) => {
  if (!discount || normalizeBoolean(discount.active, true) === false) return null;

  const percent = parseInteger(discount.percent);
  if (!Number.isFinite(percent) || percent <= 0) return null;

  return {
    id: parseInteger(discount.id),
    documentId: toTrimmedString(discount.documentId, 120) || null,
    title: toTrimmedString(discount.title, 255) || '',
    percent,
    active: true,
    comment: toTrimmedString(discount.comment, 1000) || '',
  };
};

const resolveCourseDiscount = (course) => {
  return serializeDiscount(course && course.discount);
};

const calculateDiscountedPrice = (basePrice, discount) => {
  const base = parseInteger(basePrice);
  if (!Number.isFinite(base)) return null;

  const activeDiscount = serializeDiscount(discount);
  if (!activeDiscount) return base;

  return Math.max(0, Math.round(base * ((100 - activeDiscount.percent) / 100)));
};

const prepareDiscountData = async (strapi, data, where = null) => {
  const existingDiscount = await loadDiscountByWhere(strapi, where);
  const percent = parseInteger(
    data && Object.prototype.hasOwnProperty.call(data, 'percent')
      ? data.percent
      : (existingDiscount && existingDiscount.percent)
  );
  const active = normalizeBoolean(
    data && Object.prototype.hasOwnProperty.call(data, 'active')
      ? data.active
      : (existingDiscount && existingDiscount.active),
    true
  );
  const title = toTrimmedString(
    data && Object.prototype.hasOwnProperty.call(data, 'title')
      ? data.title
      : (existingDiscount && existingDiscount.title),
    255
  );
  const courseIds = await resolveCourseIds(
    strapi,
    data && Object.prototype.hasOwnProperty.call(data, 'courses')
      ? data.courses
      : (existingDiscount && existingDiscount.courses)
  );

  if (!title) {
    throw new ValidationError('Укажите название скидки.');
  }

  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new ValidationError('Скидка должна быть целым числом от 1 до 100.');
  }

  if (!courseIds.length) {
    throw new ValidationError('Выберите хотя бы один курс для скидки.');
  }

  return {
    ...(data || {}),
    title,
    percent,
    active,
    courses: courseIds.map((id) => ({ id })),
    comment: toTrimmedString(data && data.comment, 1000) || toTrimmedString(existingDiscount && existingDiscount.comment, 1000) || null,
  };
};

const clearDiscountRelations = async (strapi, where = null) => {
  const discounts = where
    ? await strapi.db.query(DISCOUNT_UID).findMany({
      where,
      populate: {
        courses: true,
      },
    })
    : [];

  const courseIds = Array.from(new Set(
    discounts.flatMap((discount) => (
      Array.isArray(discount && discount.courses)
        ? discount.courses.map((course) => parseInteger(course && course.id))
        : []
    )).filter((value) => Number.isFinite(value))
  ));

  for (const courseId of courseIds) {
    await strapi.db.query(COURSE_UID).update({
      where: { id: courseId },
      data: { discount: null },
    });
  }

  return {
    updatedCourses: courseIds.length,
  };
};

module.exports = {
  DISCOUNT_UID,
  calculateDiscountedPrice,
  clearDiscountRelations,
  prepareDiscountData,
  resolveCourseDiscount,
  serializeDiscount,
};
