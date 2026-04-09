'use strict';

const { errors } = require('@strapi/utils');
const {
  extractCourseRef,
  loadCourseByRef,
  parseInteger,
  toTrimmedString,
} = require('./course-reference');

const { ValidationError } = errors;
const COURSE_PRICE_CHANGE_UID = 'api::course-price-change.course-price-change';
const COURSE_PRICE_CHANGES_FIELD = 'priceChanges';
const MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;
const COURSE_UID = 'api::course.course';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const parseDateTime = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsedFromNumber = new Date(value);
    return Number.isNaN(parsedFromNumber.getTime()) ? null : parsedFromNumber;
  }

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

const getCoursePriceChangeStorage = (strapi) => {
  const courseMeta = strapi.db.metadata.get(COURSE_UID);
  const changeMeta = strapi.db.metadata.get(COURSE_PRICE_CHANGE_UID);
  const relation = courseMeta && courseMeta.attributes
    ? courseMeta.attributes[COURSE_PRICE_CHANGES_FIELD]
    : null;
  const joinTable = relation && relation.joinTable ? relation.joinTable : null;

  return {
    courseTableName: courseMeta && courseMeta.tableName ? courseMeta.tableName : 'courses',
    changeTableName: changeMeta && changeMeta.tableName ? changeMeta.tableName : 'course_price_changes',
    linkTableName: joinTable && joinTable.name ? joinTable.name : 'course_price_changes_course_lnk',
    courseLinkColumn: joinTable && joinTable.joinColumn && joinTable.joinColumn.name
      ? joinTable.joinColumn.name
      : 'course_id',
    changeLinkColumn: joinTable && joinTable.inverseJoinColumn && joinTable.inverseJoinColumn.name
      ? joinTable.inverseJoinColumn.name
      : 'course_price_change_id',
    orderColumnName: joinTable && joinTable.orderColumnName ? joinTable.orderColumnName : null,
  };
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

const assertCoursePriceChangeSequenceIntegrity = (course) => {
  const courseId = parseInteger(course && course.id);
  const courseTitle = toTrimmedString(course && course.title, 255) || `#${courseId || 'unknown'}`;
  const basePrice = parseInteger(course && course.basePrice);
  const changes = sortCoursePriceChanges(getCoursePriceChanges(course));
  const seenEffectiveAt = new Set();
  let previousPrice = Number.isFinite(basePrice) ? basePrice : 0;

  for (const change of changes) {
    const effectiveAt = parseDateTime(change && change.effectiveAt);
    const targetBasePrice = parseInteger(change && change.targetBasePrice);
    const changeId = parseInteger(change && change.id);

    if (!effectiveAt || !Number.isFinite(targetBasePrice)) {
      throw new Error(`Course "${courseTitle}" has invalid scheduled price change payload.`);
    }

    const effectiveAtKey = effectiveAt.toISOString();
    if (seenEffectiveAt.has(effectiveAtKey)) {
      throw new Error(`Course "${courseTitle}" has duplicate scheduled price changes for ${effectiveAtKey}.`);
    }

    seenEffectiveAt.add(effectiveAtKey);

    if (targetBasePrice <= previousPrice) {
      throw new Error(
        `Course "${courseTitle}" has non-increasing scheduled price change `
        + `#${changeId || 'unknown'}: ${targetBasePrice} <= ${previousPrice}.`
      );
    }

    previousPrice = targetBasePrice;
  }
};

const assertPricingIntegrity = async (strapi) => {
  const courses = await strapi.db.query(COURSE_UID).findMany({
    populate: {
      discount: true,
      [COURSE_PRICE_CHANGES_FIELD]: true,
    },
    orderBy: [{ id: 'asc' }],
  });

  for (const course of Array.isArray(courses) ? courses : []) {
    assertCoursePriceChangeSequenceIntegrity(course);
  }

  return {
    checkedCourses: Array.isArray(courses) ? courses.length : 0,
  };
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
  const nowIso = now.toISOString();
  const storage = getCoursePriceChangeStorage(strapi);
  const updatedCourseIds = new Set();
  let appliedChanges = 0;

  const dueChangesByCourse = new Map();

  for (const change of dueChanges) {
    const changeId = parseInteger(change && change.id);
    const courseId = parseInteger(change && change.course && change.course.id);
    if (!Number.isFinite(changeId) || !Number.isFinite(courseId)) continue;

    if (!dueChangesByCourse.has(courseId)) {
      dueChangesByCourse.set(courseId, []);
    }

    dueChangesByCourse.get(courseId).push(changeId);
  }

  for (const [courseId, changeIds] of dueChangesByCourse.entries()) {
    const appliedBatch = await strapi.db.connection.transaction(async (trx) => {
      let linkQuery = trx(storage.linkTableName)
        .select({
          courseId: storage.courseLinkColumn,
          changeId: storage.changeLinkColumn,
        })
        .whereIn(storage.changeLinkColumn, changeIds);

      if (storage.orderColumnName) {
        linkQuery = linkQuery.orderBy(storage.orderColumnName, 'asc');
      }

      const linkedRows = await linkQuery;
      const validChangeIds = Array.from(new Set(
        (Array.isArray(linkedRows) ? linkedRows : [])
          .filter((row) => parseInteger(row && row.courseId) === courseId)
          .map((row) => parseInteger(row && row.changeId))
          .filter((id) => Number.isFinite(id))
      ));

      if (!validChangeIds.length) return null;

      const storedChanges = await trx(storage.changeTableName)
        .select({
          id: 'id',
          effectiveAt: 'effective_at',
          targetBasePrice: 'target_base_price',
        })
        .whereIn('id', validChangeIds)
        .orderBy([{ column: 'effective_at', order: 'asc' }, { column: 'id', order: 'asc' }]);

      const applicableChanges = (Array.isArray(storedChanges) ? storedChanges : [])
        .map((change) => ({
          id: parseInteger(change && change.id),
          effectiveAt: parseDateTime(change && change.effectiveAt),
          targetBasePrice: parseInteger(change && change.targetBasePrice),
        }))
        .filter((change) => Number.isFinite(change.id))
        .filter((change) => change.effectiveAt && change.effectiveAt.getTime() <= now.getTime())
        .filter((change) => Number.isFinite(change.targetBasePrice));

      if (!applicableChanges.length) return null;

      const latestChange = applicableChanges[applicableChanges.length - 1];
      const updatedCourses = await trx(storage.courseTableName)
        .where({ id: courseId })
        .update({
          base_price: latestChange.targetBasePrice,
          updated_at: nowIso,
        });

      if (!updatedCourses) {
        throw new Error(`Failed to update course ${courseId} for scheduled price changes.`);
      }

      const deletedChanges = await trx(storage.changeTableName)
        .whereIn('id', applicableChanges.map((change) => change.id))
        .delete();

      if (deletedChanges !== applicableChanges.length) {
        throw new Error(`Failed to delete all scheduled price changes for course ${courseId} after applying them.`);
      }

      return {
        courseId,
        appliedChanges: applicableChanges.length,
      };
    });

    if (!appliedBatch) continue;

    updatedCourseIds.add(appliedBatch.courseId);
    appliedChanges += appliedBatch.appliedChanges;
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
  assertCoursePriceChangeSequenceIntegrity,
  assertPricingIntegrity,
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
