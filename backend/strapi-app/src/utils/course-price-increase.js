'use strict';

const { errors } = require('@strapi/utils');

const { ValidationError } = errors;
const COURSE_UID = 'api::course.course';
const COURSE_PRICE_INCREASE_UID = 'api::course-price-increase.course-price-increase';
const MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set(['applied']);
const ALLOWED_STATUSES = new Set(['scheduled', 'applied', 'cancelled']);

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

const parseDateTime = (value) => {
  const raw = toTrimmedString(value, 80);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeStatus = (value) => {
  const raw = toTrimmedString(value, 40).toLowerCase();
  return ALLOWED_STATUSES.has(raw) ? raw : 'scheduled';
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;

  const raw = toTrimmedString(value, 20).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
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

const buildCoursePriceIncreaseName = (value, increasePercent, effectiveAt) => {
  const explicitName = toTrimmedString(value, 255);
  if (explicitName) return explicitName;

  const percent = parseInteger(increasePercent);
  const effectiveAtLabel = formatDateTimeForName(effectiveAt);
  const percentLabel = Number.isFinite(percent) ? `${percent}%` : '';

  return toTrimmedString(
    ['Повышение цены', percentLabel && `на ${percentLabel}`, effectiveAtLabel && `с ${effectiveAtLabel}`]
      .filter(Boolean)
      .join(' '),
    255
  );
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

const extractCourseIds = (items) => {
  return (Array.isArray(items) ? items : [])
    .map((item) => parseInteger(item && item.id))
    .filter((value) => Number.isFinite(value));
};

const dedupeCoursePriceIncreases = (items = []) => {
  const seen = new Set();

  return (Array.isArray(items) ? items : []).filter((item) => {
    const id = parseInteger(item && item.id);
    if (!Number.isFinite(id)) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const sortPriceIncreases = (items = []) => {
  return [...dedupeCoursePriceIncreases(items)].sort((left, right) => {
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

const serializeCoursePriceIncrease = (increase) => {
  if (!increase) return null;

  const courses = Array.isArray(increase.courses)
    ? increase.courses.map((course) => ({
      id: parseInteger(course && course.id),
      documentId: toTrimmedString(course && course.documentId, 120) || null,
      title: toTrimmedString(course && course.title, 255) || null,
      slug: toTrimmedString(course && course.slug, 255) || null,
    })).filter((course) => Number.isFinite(course.id) || course.documentId)
    : [];

  return {
    id: parseInteger(increase.id),
    documentId: toTrimmedString(increase.documentId, 120) || null,
    name: buildCoursePriceIncreaseName(increase.name, increase.increasePercent, increase.effectiveAt) || null,
    effectiveAt: toTrimmedString(increase.effectiveAt, 80) || null,
    increasePercent: parseInteger(increase.increasePercent),
    applyToAllCourses: normalizeBoolean(increase.applyToAllCourses, false),
    courses,
    status: normalizeStatus(increase.increaseState || increase.status),
    appliedAt: toTrimmedString(increase.appliedAt, 80) || null,
    comment: toTrimmedString(increase.comment, 1000) || '',
  };
};

const resolveNextCoursePriceIncrease = (course, now = new Date()) => {
  const scheduled = sortPriceIncreases(course && course.priceIncreases)
    .filter((increase) => normalizeStatus(increase && (increase.increaseState || increase.status)) === 'scheduled')
    .map((increase) => ({
      raw: increase,
      effectiveAt: parseDateTime(increase && increase.effectiveAt),
    }))
    .filter((entry) => entry.effectiveAt && entry.effectiveAt.getTime() > now.getTime());

  return scheduled.length ? serializeCoursePriceIncrease(scheduled[0].raw) : null;
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

const loadAllCourseIds = async (strapi) => {
  const courses = await strapi.db.query(COURSE_UID).findMany({
    orderBy: [{ id: 'asc' }],
  });

  return Array.from(new Set(
    (Array.isArray(courses) ? courses : [])
      .map((course) => parseInteger(course && course.id))
      .filter((id) => Number.isFinite(id))
  ));
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

const loadCoursePriceIncreaseByWhere = async (strapi, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id !== undefined && where.id !== null) {
    return strapi.db.query(COURSE_PRICE_INCREASE_UID).findOne({
      where: { id: where.id },
      populate: {
        courses: true,
      },
    });
  }

  if (where.documentId) {
    return strapi.db.query(COURSE_PRICE_INCREASE_UID).findOne({
      where: { documentId: where.documentId },
      populate: {
        courses: true,
      },
    });
  }

  return null;
};

const loadGlobalCoursePriceIncreases = async (strapi) => {
  return strapi.db.query(COURSE_PRICE_INCREASE_UID).findMany({
    where: {
      applyToAllCourses: true,
      increaseState: { $ne: 'cancelled' },
    },
    populate: {
      courses: true,
    },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
  });
};

const mergeCoursePriceIncreases = (course, globalIncreases = []) => {
  return dedupeCoursePriceIncreases([
    ...(Array.isArray(course && course.priceIncreases) ? course.priceIncreases : []),
    ...(Array.isArray(globalIncreases) ? globalIncreases : []),
  ]);
};

const assertEffectiveAtWindow = (effectiveAtRaw, now = new Date()) => {
  const effectiveAt = parseDateTime(effectiveAtRaw);
  if (!effectiveAt) {
    throw new ValidationError('Укажите корректные дату и время применения.');
  }

  if (effectiveAt.getTime() < now.getTime() - MAX_BACKDATE_MS) {
    throw new ValidationError('Повышение цены можно создать в прошлом не более чем на 24 часа назад.');
  }

  return effectiveAt;
};

const assertManualStatusChangeAllowed = (nextStatus, existingIncrease = null) => {
  const existingStatus = normalizeStatus(existingIncrease && (existingIncrease.increaseState || existingIncrease.status));

  if (FINAL_STATUSES.has(existingStatus)) {
    throw new ValidationError('Примененное повышение цены нельзя изменять.');
  }

  if (nextStatus === 'applied') {
    throw new ValidationError('Статус "applied" выставляется автоматически после применения повышения цены.');
  }
};

const assertIncreasePercentIsValid = (increasePercent) => {
  if (!Number.isFinite(increasePercent) || increasePercent <= 0) {
    throw new ValidationError('Процент повышения должен быть целым числом больше 0.');
  }
};

const assertIncreaseNameIsValid = (name) => {
  if (!name) {
    throw new ValidationError('Укажите название повышения цены.');
  }
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

const prepareCoursePriceIncreaseData = async (strapi, data, where = null) => {
  const existingIncrease = await loadCoursePriceIncreaseByWhere(strapi, where);
  const isCreate = !existingIncrease;
  const nextStatus = isCreate
    ? 'scheduled'
    : normalizeStatus(
      data && Object.prototype.hasOwnProperty.call(data, 'increaseState')
        ? data.increaseState
        : (existingIncrease && (existingIncrease.increaseState || existingIncrease.status))
    );
  const existingStatus = normalizeStatus(existingIncrease && (existingIncrease.increaseState || existingIncrease.status));

  if (FINAL_STATUSES.has(existingStatus)) {
    throw new ValidationError('Примененное повышение цены нельзя изменять.');
  }

  if (nextStatus === 'cancelled') {
    return {
      ...(data || {}),
      increaseState: isCreate ? 'scheduled' : 'cancelled',
      appliedAt: existingIncrease ? existingIncrease.appliedAt || null : null,
      comment: toTrimmedString(data && data.comment, 1000) || toTrimmedString(existingIncrease && existingIncrease.comment, 1000) || null,
    };
  }

  const effectiveAtRaw = toTrimmedString(
    data && Object.prototype.hasOwnProperty.call(data, 'effectiveAt')
      ? data.effectiveAt
      : (existingIncrease && existingIncrease.effectiveAt),
    80
  );
  const effectiveAt = assertEffectiveAtWindow(effectiveAtRaw);
  const applyToAllCourses = normalizeBoolean(
    data && Object.prototype.hasOwnProperty.call(data, 'applyToAllCourses')
      ? data.applyToAllCourses
      : (existingIncrease && existingIncrease.applyToAllCourses),
    false
  );
  const increasePercent = parseInteger(
    data && Object.prototype.hasOwnProperty.call(data, 'increasePercent')
      ? data.increasePercent
      : (existingIncrease && existingIncrease.increasePercent)
  );
  const name = buildCoursePriceIncreaseName(
    data && Object.prototype.hasOwnProperty.call(data, 'name')
      ? data.name
      : (existingIncrease && existingIncrease.name),
    increasePercent,
    effectiveAt.toISOString()
  );
  const selectedCourseIds = applyToAllCourses
    ? await loadAllCourseIds(strapi)
    : await resolveCourseIds(
      strapi,
      data && Object.prototype.hasOwnProperty.call(data, 'courses')
        ? data.courses
        : (existingIncrease && existingIncrease.courses)
    );

  assertManualStatusChangeAllowed(nextStatus, existingIncrease);
  assertIncreaseNameIsValid(name);
  assertIncreasePercentIsValid(increasePercent);

  if (!applyToAllCourses && !selectedCourseIds.length) {
    throw new ValidationError('Выберите хотя бы один курс или включите режим "Применить ко всем курсам".');
  }

  return {
    ...(data || {}),
    name,
    effectiveAt: effectiveAt.toISOString(),
    increasePercent,
    applyToAllCourses,
    courses: selectedCourseIds.map((id) => ({ id })),
    increaseState: isCreate ? 'scheduled' : nextStatus,
    appliedAt: existingIncrease ? existingIncrease.appliedAt || null : null,
    comment: toTrimmedString(data && data.comment, 1000) || toTrimmedString(existingIncrease && existingIncrease.comment, 1000) || null,
  };
};

const migrateCoursePriceIncreaseNames = async (strapi) => {
  const clientName = toTrimmedString(
    strapi && strapi.db && strapi.db.connection && strapi.db.connection.client && strapi.db.connection.client.config
      ? strapi.db.connection.client.config.client
      : '',
    40
  ).toLowerCase();

  if (!clientName || clientName.includes('sqlite')) {
    return { skipped: true, reason: 'unsupported-client' };
  }

  const hasNameColumn = await columnExists(strapi, 'course_price_increases', 'name');
  if (!hasNameColumn) {
    return { skipped: true, reason: 'missing-name-column' };
  }

  const increases = await strapi.db.connection('course_price_increases')
    .select(['id', 'name', 'increase_percent', 'effective_at'])
    .orderBy([{ column: 'id', order: 'asc' }]);

  let updatedIncreases = 0;

  for (const increase of increases) {
    if (toTrimmedString(increase && increase.name, 255)) continue;

    const nextName = buildCoursePriceIncreaseName(
      '',
      increase && increase.increase_percent,
      increase && increase.effective_at
    );

    if (!nextName) continue;

    await strapi.db.connection('course_price_increases')
      .where({ id: increase.id })
      .update({ name: nextName });

    updatedIncreases += 1;
  }

  return {
    skipped: false,
    updatedIncreases,
  };
};

let isApplyingCoursePriceIncreases = false;

const applyIncreasePercent = (basePrice, increasePercent) => {
  const nextBasePrice = parseInteger(basePrice);
  const percent = parseInteger(increasePercent);
  if (!Number.isFinite(nextBasePrice) || !Number.isFinite(percent)) return null;

  return Math.max(0, Math.round(nextBasePrice * ((100 + percent) / 100)));
};

const applyDueCoursePriceIncreases = async (strapi, now = new Date()) => {
  if (isApplyingCoursePriceIncreases) {
    return { skipped: true, appliedIncreases: 0, updatedCourses: 0 };
  }

  isApplyingCoursePriceIncreases = true;

  try {
    const dueIncreases = await strapi.db.query(COURSE_PRICE_INCREASE_UID).findMany({
      where: {
        increaseState: 'scheduled',
        effectiveAt: { $lte: now.toISOString() },
      },
      populate: {
        courses: true,
      },
      orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
    });

    if (!dueIncreases.length) {
      return { skipped: false, appliedIncreases: 0, updatedCourses: 0 };
    }

    const courses = await strapi.db.query(COURSE_UID).findMany({
      orderBy: [{ id: 'asc' }],
    });
    const courseMap = new Map(
      courses.map((course) => [
        parseInteger(course && course.id),
        {
          id: parseInteger(course && course.id),
          basePrice: parseInteger(course && course.basePrice),
        },
      ]).filter(([id]) => Number.isFinite(id))
    );
    const allCourseIds = Array.from(courseMap.keys());
    const appliedIds = [];
    const changedCourseIds = new Set();

    for (const increase of dueIncreases) {
      const increaseId = parseInteger(increase && increase.id);
      const percent = parseInteger(increase && increase.increasePercent);
      if (!Number.isFinite(increaseId) || !Number.isFinite(percent)) continue;

      const targetCourseIds = normalizeBoolean(increase && increase.applyToAllCourses, false)
        ? allCourseIds
        : extractCourseIds(increase && increase.courses);

      for (const courseId of targetCourseIds) {
        const course = courseMap.get(courseId);
        if (!course || !Number.isFinite(course.basePrice)) continue;

        const nextBasePrice = applyIncreasePercent(course.basePrice, percent);
        if (!Number.isFinite(nextBasePrice)) continue;

        course.basePrice = nextBasePrice;
        changedCourseIds.add(courseId);
      }

      appliedIds.push(increaseId);
    }

    for (const courseId of changedCourseIds) {
      const course = courseMap.get(courseId);
      if (!course || !Number.isFinite(course.basePrice)) continue;

      await strapi.db.query(COURSE_UID).update({
        where: { id: courseId },
        data: { basePrice: course.basePrice },
      });
    }

    const appliedAt = now.toISOString();

    if (appliedIds.length) {
      await strapi.db.connection('course_price_increases')
        .whereIn('id', appliedIds)
        .andWhere('increase_state', 'scheduled')
        .update({
          increase_state: 'applied',
          applied_at: appliedAt,
          updated_at: appliedAt,
        });
    }

    return {
      skipped: false,
      appliedIncreases: appliedIds.length,
      updatedCourses: changedCourseIds.size,
    };
  } finally {
    isApplyingCoursePriceIncreases = false;
  }
};

module.exports = {
  COURSE_PRICE_INCREASE_UID,
  applyDueCoursePriceIncreases,
  loadGlobalCoursePriceIncreases,
  mergeCoursePriceIncreases,
  migrateCoursePriceIncreaseNames,
  prepareCoursePriceIncreaseData,
  resolveNextCoursePriceIncrease,
  serializeCoursePriceIncrease,
  sortPriceIncreases,
};
