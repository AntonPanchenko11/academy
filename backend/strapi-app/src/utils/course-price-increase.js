'use strict';

const { errors } = require('@strapi/utils');

const { ValidationError } = errors;
const COURSE_UID = 'api::course.course';
const COURSE_PRICE_CHANGE_UID = 'api::course-price-change.course-price-change';
const COURSE_PRICE_CHANGES_FIELD = 'priceChanges';
const MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;

const toTrimmedString = (value, maxLen = 255) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return '';

  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLen);
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

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

const parseDateTime = (value) => {
  const raw = toTrimmedString(value, 80);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTimeForName = (value) => {
  const parsed = parseDateTime(value);
  if (!parsed) return '';

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const hours = String(parsed.getUTCHours()).padStart(2, '0');
  const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
};

const buildCoursePriceChangeName = (value, targetBasePrice, effectiveAt) => {
  const explicitName = toTrimmedString(value, 255);
  if (explicitName) return explicitName;

  const price = parseInteger(targetBasePrice);
  const effectiveAtLabel = formatDateTimeForName(effectiveAt);

  return toTrimmedString(
    ['Цена', Number.isFinite(price) ? `${price} ₽` : '', effectiveAtLabel && `с ${effectiveAtLabel}`]
      .filter(Boolean)
      .join(' '),
    255
  );
};

const extractCourseRef = (value) => {
  if (typeof value === 'number' || typeof value === 'string') {
    const id = parseInteger(value);
    return {
      id: Number.isFinite(id) ? id : null,
      documentId: Number.isFinite(id) ? null : toTrimmedString(value, 120) || null,
    };
  }

  if (Array.isArray(value)) {
    return extractCourseRef(value[0]);
  }

  if (!value || typeof value !== 'object') {
    return { id: null, documentId: null };
  }

  if (Array.isArray(value.connect) && value.connect.length) {
    return extractCourseRef(value.connect[0]);
  }

  if (Array.isArray(value.set) && value.set.length) {
    return extractCourseRef(value.set[0]);
  }

  const id = parseInteger(value.id);
  const documentId = toTrimmedString(value.documentId, 120);

  return {
    id: Number.isFinite(id) ? id : null,
    documentId: documentId || null,
  };
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

const loadCourseByWhere = async (strapi, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id !== undefined && where.id !== null) {
    return strapi.db.query(COURSE_UID).findOne({
      where: { id: where.id },
    });
  }

  if (where.documentId) {
    return strapi.db.query(COURSE_UID).findOne({
      where: { documentId: where.documentId },
    });
  }

  return null;
};

const loadCoursePriceChangeByWhere = async (strapi, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id !== undefined && where.id !== null) {
    return strapi.db.query(COURSE_PRICE_CHANGE_UID).findOne({
      where: { id: where.id },
      populate: {
        course: true,
      },
    });
  }

  if (where.documentId) {
    return strapi.db.query(COURSE_PRICE_CHANGE_UID).findOne({
      where: { documentId: where.documentId },
      populate: {
        course: true,
      },
    });
  }

  return null;
};

const sortCoursePriceChanges = (items = []) => {
  return [...(Array.isArray(items) ? items : [])]
    .filter((item) => item && typeof item === 'object')
    .sort((left, right) => {
      const leftAt = parseDateTime(left && left.effectiveAt);
      const rightAt = parseDateTime(right && right.effectiveAt);
      const leftTs = leftAt ? leftAt.getTime() : Number.MAX_SAFE_INTEGER;
      const rightTs = rightAt ? rightAt.getTime() : Number.MAX_SAFE_INTEGER;
      if (leftTs !== rightTs) return leftTs - rightTs;

      const leftId = parseInteger(left && left.id) || 0;
      const rightId = parseInteger(right && right.id) || 0;
      return leftId - rightId;
    });
};

const serializeCoursePriceChange = (change) => {
  if (!change || typeof change !== 'object') return null;

  const effectiveAt = parseDateTime(change.effectiveAt);
  const targetBasePrice = parseInteger(change.targetBasePrice);
  if (!effectiveAt || !Number.isFinite(targetBasePrice)) return null;

  return {
    id: parseInteger(change.id),
    documentId: toTrimmedString(change.documentId, 120) || null,
    name: buildCoursePriceChangeName(change.name, targetBasePrice, effectiveAt.toISOString()),
    effectiveAt: effectiveAt.toISOString(),
    targetBasePrice,
    comment: toTrimmedString(change.comment, 1000) || '',
  };
};

const getCoursePriceChanges = (course) => {
  return Array.isArray(course && course[COURSE_PRICE_CHANGES_FIELD])
    ? course[COURSE_PRICE_CHANGES_FIELD]
    : [];
};

const resolveDueCoursePriceChanges = (course, now = new Date()) => {
  return sortCoursePriceChanges(getCoursePriceChanges(course))
    .map((change) => serializeCoursePriceChange(change))
    .filter(Boolean)
    .filter((change) => {
      const effectiveAt = parseDateTime(change && change.effectiveAt);
      return Boolean(effectiveAt && effectiveAt.getTime() <= now.getTime());
    });
};

const resolveCoursePriceChanges = (course, now = new Date()) => {
  return sortCoursePriceChanges(getCoursePriceChanges(course))
    .map((change) => serializeCoursePriceChange(change))
    .filter(Boolean)
    .filter((change) => {
      const effectiveAt = parseDateTime(change && change.effectiveAt);
      return Boolean(effectiveAt && effectiveAt.getTime() > now.getTime());
    });
};

const resolveNextCoursePriceChange = (course, now = new Date()) => {
  const scheduled = resolveCoursePriceChanges(course, now);
  return scheduled.length ? scheduled[0] : null;
};

const calculateCurrentCourseBasePrice = (course, now = new Date()) => {
  const rawBasePrice = parseInteger(course && course.basePrice);
  if (!Number.isFinite(rawBasePrice)) return null;

  const dueChanges = resolveDueCoursePriceChanges(course, now);
  if (!dueChanges.length) return rawBasePrice;

  return dueChanges[dueChanges.length - 1].targetBasePrice;
};

const assertCoursePriceChangeIsUnique = async (strapi, courseId, effectiveAt, currentChangeId = null) => {
  const normalizedCourseId = parseInteger(courseId);
  const effectiveDate = parseDateTime(effectiveAt);

  if (!Number.isFinite(normalizedCourseId) || !effectiveDate) return;

  const existingChanges = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findMany({
    where: {
      course: {
        id: normalizedCourseId,
      },
    },
    orderBy: [{ id: 'asc' }],
  });

  const duplicate = (Array.isArray(existingChanges) ? existingChanges : []).find((change) => {
    const changeId = parseInteger(change && change.id);
    if (Number.isFinite(currentChangeId) && changeId === currentChangeId) return false;

    const changeEffectiveAt = parseDateTime(change && change.effectiveAt);
    return Boolean(changeEffectiveAt && changeEffectiveAt.getTime() === effectiveDate.getTime());
  });

  if (!duplicate) return;

  throw new ValidationError('Для курса уже существует изменение цены на эту дату и время.');
};

const assertCoursePriceChangeRaisesPrice = async (
  strapi,
  course,
  effectiveAt,
  targetBasePrice,
  currentChangeId = null
) => {
  const courseId = parseInteger(course && course.id);
  const effectiveDate = parseDateTime(effectiveAt);
  const candidatePrice = parseInteger(targetBasePrice);
  const currentId = parseInteger(currentChangeId);
  if (!Number.isFinite(courseId) || !effectiveDate || !Number.isFinite(candidatePrice)) return;

  const existingChanges = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findMany({
    where: {
      course: {
        id: courseId,
      },
    },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
  });

  const relevantChanges = sortCoursePriceChanges(
    (Array.isArray(existingChanges) ? existingChanges : []).filter((change) => {
      const changeId = parseInteger(change && change.id);
      return !Number.isFinite(currentId) || changeId !== currentId;
    })
  );

  let previousPrice = parseInteger(course && course.basePrice);
  let nextScheduledPrice = null;

  for (const change of relevantChanges) {
    const changeEffectiveAt = parseDateTime(change && change.effectiveAt);
    const changeTargetPrice = parseInteger(change && change.targetBasePrice);
    if (!changeEffectiveAt || !Number.isFinite(changeTargetPrice)) continue;

    if (changeEffectiveAt.getTime() < effectiveDate.getTime()) {
      previousPrice = changeTargetPrice;
      continue;
    }

    nextScheduledPrice = changeTargetPrice;
    break;
  }

  if (!Number.isFinite(previousPrice)) {
    previousPrice = 0;
  }

  if (candidatePrice <= previousPrice) {
    throw new ValidationError(
      `Новая базовая цена должна быть больше предыдущей цены ${previousPrice}.`
    );
  }

  if (Number.isFinite(nextScheduledPrice) && candidatePrice >= nextScheduledPrice) {
    throw new ValidationError(
      `Новая базовая цена должна быть меньше следующей запланированной цены ${nextScheduledPrice}.`
    );
  }
};

const prepareCoursePriceChangeData = async (strapi, data, where = null, now = new Date()) => {
  const existingChange = await loadCoursePriceChangeByWhere(strapi, where);
  const courseRef = hasOwn(data, 'course') ? data.course : (existingChange && existingChange.course);
  const course = await loadCourseByRef(strapi, extractCourseRef(courseRef));
  const courseId = parseInteger(course && course.id);

  if (!Number.isFinite(courseId)) {
    throw new ValidationError('Выберите существующий курс для изменения цены.');
  }

  const effectiveAt = parseDateTime(
    hasOwn(data, 'effectiveAt') ? data.effectiveAt : (existingChange && existingChange.effectiveAt)
  );
  if (!effectiveAt) {
    throw new ValidationError('Укажите корректные дату и время применения.');
  }

  if (effectiveAt.getTime() < now.getTime() - MAX_BACKDATE_MS) {
    throw new ValidationError('Изменение цены можно создать в прошлом не более чем на 24 часа назад.');
  }

  const targetBasePrice = parseInteger(
    hasOwn(data, 'targetBasePrice') ? data.targetBasePrice : (existingChange && existingChange.targetBasePrice)
  );
  if (!Number.isFinite(targetBasePrice) || targetBasePrice < 0) {
    throw new ValidationError('Новая базовая цена должна быть целым числом больше или равна 0.');
  }

  const name = buildCoursePriceChangeName(
    hasOwn(data, 'name') ? data.name : (existingChange && existingChange.name),
    targetBasePrice,
    effectiveAt.toISOString()
  );
  if (!name) {
    throw new ValidationError('Укажите название изменения цены.');
  }

  await assertCoursePriceChangeIsUnique(
    strapi,
    courseId,
    effectiveAt.toISOString(),
    parseInteger(existingChange && existingChange.id)
  );
  await assertCoursePriceChangeRaisesPrice(
    strapi,
    course,
    effectiveAt.toISOString(),
    targetBasePrice,
    parseInteger(existingChange && existingChange.id)
  );

  return {
    ...(data || {}),
    course: { id: courseId },
    name,
    effectiveAt: effectiveAt.toISOString(),
    targetBasePrice,
    comment: toTrimmedString(
      hasOwn(data, 'comment') ? data.comment : (existingChange && existingChange.comment),
      1000
    ) || null,
  };
};

const findDueCoursePriceChanges = async (strapi, now = new Date()) => {
  const dueChanges = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findMany({
    where: {
      effectiveAt: {
        $lte: now.toISOString(),
      },
    },
    populate: {
      course: true,
    },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
  });

  return sortCoursePriceChanges(dueChanges).filter((change) => {
    const courseId = parseInteger(change && change.course && change.course.id);
    return Number.isFinite(courseId);
  });
};

const applyDueCoursePriceChanges = async (strapi, now = new Date()) => {
  const dueChanges = await findDueCoursePriceChanges(strapi, now);
  const updatedCourseIds = new Set();
  let appliedChanges = 0;

  for (const change of dueChanges) {
    const changeId = parseInteger(change && change.id);
    const courseId = parseInteger(change && change.course && change.course.id);
    const targetBasePrice = parseInteger(change && change.targetBasePrice);
    if (!Number.isFinite(changeId) || !Number.isFinite(courseId) || !Number.isFinite(targetBasePrice)) continue;

    const existingChange = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findOne({
      where: { id: changeId },
      populate: {
        course: true,
      },
    });
    if (!existingChange) continue;

    const effectiveAt = parseDateTime(existingChange.effectiveAt);
    if (!effectiveAt || effectiveAt.getTime() > now.getTime()) continue;

    await strapi.db.query(COURSE_UID).update({
      where: { id: courseId },
      data: {
        basePrice: targetBasePrice,
      },
    });

    await strapi.db.query(COURSE_PRICE_CHANGE_UID).delete({
      where: { id: changeId },
    });

    updatedCourseIds.add(courseId);
    appliedChanges += 1;
  }

  return {
    appliedChanges,
    updatedCourses: updatedCourseIds.size,
  };
};

const deleteCoursePriceChangesForCourseWhere = async (strapi, where) => {
  const course = await loadCourseByWhere(strapi, where);
  const courseId = parseInteger(course && course.id);
  if (!Number.isFinite(courseId)) {
    return {
      deletedChanges: 0,
      courseId: null,
    };
  }

  const changes = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findMany({
    where: {
      course: {
        id: courseId,
      },
    },
    orderBy: [{ id: 'asc' }],
  });

  let deletedChanges = 0;

  for (const change of Array.isArray(changes) ? changes : []) {
    const changeId = parseInteger(change && change.id);
    if (!Number.isFinite(changeId)) continue;

    await strapi.db.query(COURSE_PRICE_CHANGE_UID).delete({
      where: { id: changeId },
    });
    deletedChanges += 1;
  }

  return {
    deletedChanges,
    courseId,
  };
};

const deleteOrphanedCoursePriceChanges = async (strapi) => {
  const changes = await strapi.db.query(COURSE_PRICE_CHANGE_UID).findMany({
    populate: {
      course: true,
    },
    orderBy: [{ id: 'asc' }],
  });

  let deletedChanges = 0;

  for (const change of Array.isArray(changes) ? changes : []) {
    const changeId = parseInteger(change && change.id);
    const courseId = parseInteger(change && change.course && change.course.id);
    if (!Number.isFinite(changeId) || Number.isFinite(courseId)) continue;

    await strapi.db.query(COURSE_PRICE_CHANGE_UID).delete({
      where: { id: changeId },
    });
    deletedChanges += 1;
  }

  return {
    deletedChanges,
  };
};

module.exports = {
  COURSE_PRICE_CHANGE_UID,
  COURSE_PRICE_CHANGES_FIELD,
  applyDueCoursePriceChanges,
  calculateCurrentCourseBasePrice,
  deleteCoursePriceChangesForCourseWhere,
  deleteOrphanedCoursePriceChanges,
  findDueCoursePriceChanges,
  prepareCoursePriceChangeData,
  resolveCoursePriceChanges,
  resolveNextCoursePriceChange,
  serializeCoursePriceChange,
  sortCoursePriceChanges,
};
