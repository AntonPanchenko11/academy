'use strict';

const { errors } = require('@strapi/utils');
const {
  normalizeBoolean,
  parseInteger,
  resolveCourseIds,
  resolveCourseRelationIds,
  toTrimmedString,
} = require('./course-reference');

const { ValidationError } = errors;
const DISCOUNT_UID = 'api::discount.discount';

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

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const prepareDiscountData = async (strapi, data, where = null) => {
  const existingDiscount = await loadDiscountByWhere(strapi, where);
  const percent = parseInteger(
    hasOwn(data, 'percent')
      ? data.percent
      : (existingDiscount && existingDiscount.percent)
  );
  const active = normalizeBoolean(
    hasOwn(data, 'active')
      ? data.active
      : (existingDiscount && existingDiscount.active),
    true
  );
  const title = toTrimmedString(
    hasOwn(data, 'title')
      ? data.title
      : (existingDiscount && existingDiscount.title),
    255
  );
  const nextCoursesValue = hasOwn(data, 'courses')
    ? data.courses
    : (existingDiscount && existingDiscount.courses);
  const courseIds = hasOwn(data, 'courses')
    ? await resolveCourseRelationIds(strapi, nextCoursesValue, existingDiscount && existingDiscount.courses)
    : await resolveCourseIds(strapi, nextCoursesValue);

  if (!title) {
    throw new ValidationError('Укажите название скидки.');
  }

  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new ValidationError('Скидка должна быть целым числом от 1 до 100.');
  }

  return {
    ...(data || {}),
    title,
    percent,
    active,
    courses: courseIds.map((id) => ({ id })),
    comment: toTrimmedString(
      hasOwn(data, 'comment') ? data.comment : (existingDiscount && existingDiscount.comment),
      1000
    ) || null,
  };
};

module.exports = {
  DISCOUNT_UID,
  calculateDiscountedPrice,
  prepareDiscountData,
  resolveCourseDiscount,
  serializeDiscount,
};
