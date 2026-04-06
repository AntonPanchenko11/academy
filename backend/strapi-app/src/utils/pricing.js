'use strict';

const { errors } = require('@strapi/utils');

const COURSE_UID = 'api::course.course';
const PRICING_SETTINGS_UID = 'api::pricing-setting.pricing-setting';
const PG_INTEGER_TYPES = new Set(['integer', 'int', 'int4', 'smallint', 'int2', 'bigint', 'int8']);
const DEFAULT_APP_UTC_OFFSET = '+03:00';
const PRICING_SETTINGS_COMPONENTS_TABLE = 'pricing_settings_cmps';
const PRICE_INCREASE_COMPONENTS_TABLE = 'components_pricing_price_increases';
const COURSE_DISCOUNT_COMPONENTS_TABLE = 'components_pricing_course_discounts';
const MONTHS_GENITIVE_LOWER = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const { ValidationError } = errors;
const PRICE_INCREASE_APPLY_ALL = 'Поднять цены всем';
const PRICE_INCREASE_APPLY_SELECTED = 'Поднять цены выбранным';
const PRICING_SETTINGS_COMPONENT_FIELDS = {
  scheduledIncreases: {
    componentType: 'pricing.price-increase',
    componentTable: PRICE_INCREASE_COMPONENTS_TABLE,
  },
  courseDiscounts: {
    componentType: 'pricing.course-discount',
    componentTable: COURSE_DISCOUNT_COMPONENTS_TABLE,
  },
};

let isPricingSyncRunning = false;
let isPricingSettingsNormalizationRunning = false;

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

const normalizePercent = (value) => {
  const parsed = parseInteger(value);
  if (parsed === null) return 0;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const normalizeTimeValue = (value) => {
  const raw = toTrimmedString(value, 32);
  if (!raw) return '00:00:00';

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '00:00:00';

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3] || '00', 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return '00:00:00';
  }

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
};

const normalizeUtcOffset = (value) => {
  const raw = toTrimmedString(value, 16);
  if (!raw) return DEFAULT_APP_UTC_OFFSET;

  const match = raw.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return DEFAULT_APP_UTC_OFFSET;

  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);

  if (hours > 14 || minutes > 59) {
    return DEFAULT_APP_UTC_OFFSET;
  }

  return `${match[1]}${match[2]}:${match[3]}`;
};

const safeDecodeURIComponent = (value) => {
  const text = toTrimmedString(value, 2000);
  if (!text) return '';

  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
};

const normalizePathname = (value) => {
  const text = toTrimmedString(value, 1000);
  if (!text) return '';

  const withoutHost = text.replace(/^https?:\/\/[^/]+/i, '');
  const beforeHash = withoutHost.split('#')[0];
  const beforeQuery = beforeHash.split('?')[0];
  const decoded = safeDecodeURIComponent(beforeQuery);
  const path = decoded.startsWith('/') ? decoded : `/${decoded}`;

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

const APP_UTC_OFFSET = normalizeUtcOffset(process.env.APP_UTC_OFFSET);
const DB_CLIENT_NAME = toTrimmedString(process.env.DATABASE_CLIENT, 40).toLowerCase();
const APP_UTC_OFFSET_MINUTES = (() => {
  const match = APP_UTC_OFFSET.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 180;

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);
  return sign * ((hours * 60) + minutes);
})();

const supportsSelectForUpdate = (strapi) => {
  const clientName = toTrimmedString(
    DB_CLIENT_NAME
      || (strapi && strapi.db && strapi.db.connection && strapi.db.connection.client && strapi.db.connection.client.config
        ? strapi.db.connection.client.config.client
        : ''),
    40
  ).toLowerCase();

  return clientName && !clientName.includes('sqlite');
};

const extractAmount = (value) => {
  const raw = toTrimmedString(value, 255);
  if (!raw) return null;

  const match = raw.match(/(\d[\d\s]*)/);
  if (!match) return null;

  return parseInteger(match[1]);
};

const parseLegacyDisplayPrice = (value) => {
  const raw = toTrimmedString(value, 255);
  if (!raw) {
    return {
      raw: '',
      basePrice: null,
      discountPercent: 0,
      discountedPrice: null,
    };
  }

  const discountMatch = raw.match(/^-\s*(\d{1,3})\s*%/);
  const amountSource = discountMatch ? raw.slice(discountMatch[0].length).trim() : raw;
  const discountedPrice = extractAmount(amountSource);
  if (discountedPrice === null) {
    return {
      raw,
      basePrice: null,
      discountPercent: 0,
      discountedPrice: null,
    };
  }

  const discountPercent = discountMatch ? normalizePercent(discountMatch[1]) : 0;

  let basePrice = discountedPrice;
  if (discountPercent > 0 && discountPercent < 100) {
    basePrice = Math.round(discountedPrice / (1 - (discountPercent / 100)));
  }

  return {
    raw,
    basePrice,
    discountPercent,
    discountedPrice,
  };
};

const applyDiscount = (basePrice, discountPercent) => {
  if (!Number.isFinite(basePrice)) return null;
  if (!discountPercent) return Math.round(basePrice);
  return Math.max(0, Math.round(basePrice * ((100 - discountPercent) / 100)));
};

const buildStoredPrice = ({ discountedPrice }) => {
  if (!Number.isFinite(discountedPrice)) return null;
  return Math.max(0, Math.round(discountedPrice));
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

const buildEffectiveAtValue = (effectiveDate, effectiveTime) => {
  const normalizedDate = toTrimmedString(effectiveDate, 32);
  if (!normalizedDate) return null;

  return `${normalizedDate}T${normalizeTimeValue(effectiveTime)}${APP_UTC_OFFSET}`;
};

const formatDateLabelRu = (value) => {
  const raw = toTrimmedString(value, 32);
  if (!raw) return null;

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;

  const monthIndex = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  const month = MONTHS_GENITIVE_LOWER[monthIndex] || null;
  if (!month || !Number.isFinite(day)) return raw;

  return `${day} ${month}`;
};

const formatPriceDisplay = (value) => {
  const amount = parseInteger(value);
  if (!Number.isFinite(amount)) return '';
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
};

const resolveCoursePricing = (input = {}, existingCourse = null, options = {}) => {
  const current = {
    ...(existingCourse || {}),
    ...(input || {}),
  };

  const legacy = parseLegacyDisplayPrice(current.price);
  const currentPrice = parsePlainInteger(current.price);
  const explicitBasePrice = parseInteger(current.basePrice);
  const existingBasePrice = existingCourse ? parseInteger(existingCourse.basePrice) : null;
  let basePrice = explicitBasePrice ?? existingBasePrice;
  const forcedDiscountPercent = options && options.discountPercent !== undefined
    ? normalizePercent(options.discountPercent)
    : null;
  const discountPercent = forcedDiscountPercent !== null
    ? forcedDiscountPercent
    : normalizePercent(
      current.discountPercent !== undefined
        ? current.discountPercent
        : (existingCourse && existingCourse.discountPercent !== undefined
          ? existingCourse.discountPercent
          : legacy.discountPercent)
    );
  const discountedPriceSource = parseInteger(current.discountedPrice)
    ?? (existingCourse ? parseInteger(existingCourse.discountedPrice) : null)
    ?? currentPrice
    ?? legacy.discountedPrice;

  if (!Number.isFinite(basePrice) && Number.isFinite(discountedPriceSource)) {
    if (discountPercent > 0 && discountPercent < 100) {
      basePrice = Math.round(discountedPriceSource / (1 - (discountPercent / 100)));
    } else {
      basePrice = discountedPriceSource;
    }
  }

  if (!Number.isFinite(basePrice)) {
    return {
      basePrice: null,
      discountPercent,
      discountedPrice: Number.isFinite(discountedPriceSource) ? discountedPriceSource : null,
      price: Number.isFinite(discountedPriceSource) ? discountedPriceSource : null,
    };
  }

  const discountedPrice = applyDiscount(basePrice, discountPercent);

  return {
    basePrice,
    discountPercent,
    discountedPrice,
    price: buildStoredPrice({ discountedPrice }),
  };
};

const extractDiscountCourseIds = (discount) => {
  if (!discount || !Array.isArray(discount.courses)) return [];

  return discount.courses
    .map((course) => {
      if (typeof course === 'number') return parseInteger(course);
      return parseInteger(course && course.id);
    })
    .filter((value) => Number.isFinite(value));
};

const resolveCourseDiscount = (course, settings) => {
  const courseId = parseInteger(course && course.id);
  if (!Number.isFinite(courseId) || !settings || !Array.isArray(settings.courseDiscounts)) {
    return null;
  }

  const matchedDiscount = settings.courseDiscounts.reduce((bestMatch, discount) => {
    if (!discount || discount.active === false) return bestMatch;

    const courseIds = extractDiscountCourseIds(discount);
    if (!courseIds.includes(courseId)) return bestMatch;

    const currentPercent = normalizePercent(discount.percent);
    if (!currentPercent) return bestMatch;
    if (!bestMatch || currentPercent > bestMatch.percent) {
      return {
        title: toTrimmedString(discount.title, 255) || null,
        percent: currentPercent,
      };
    }

    return bestMatch;
  }, null);

  if (!matchedDiscount) return null;

  return {
    title: matchedDiscount.title,
    percent: matchedDiscount.percent,
    label: matchedDiscount.title
      ? `${matchedDiscount.title}: скидка ${matchedDiscount.percent}%`
      : `Скидка ${matchedDiscount.percent}%`,
  };
};

const resolveCourseDiscountPercent = (course, settings) => {
  const discount = resolveCourseDiscount(course, settings);
  return discount ? discount.percent : 0;
};

const hasCoursePricingDiff = (course, pricing) => {
  return parseInteger(course.basePrice) !== parseInteger(pricing.basePrice)
    || normalizePercent(course.discountPercent) !== normalizePercent(pricing.discountPercent)
    || parseInteger(course.discountedPrice) !== parseInteger(pricing.discountedPrice)
    || toTrimmedString(course.price, 255) !== toTrimmedString(pricing.price, 255);
};

const hasCourseScheduledIncreaseIdsDiff = (course, scheduledIncreaseIds) => {
  const currentIds = normalizeScheduledIncreaseIds(course && course.scheduledIncreaseIds);
  const nextIds = normalizeScheduledIncreaseIds(scheduledIncreaseIds);

  if (currentIds.length !== nextIds.length) return true;

  return currentIds.some((value, index) => value !== nextIds[index]);
};

const loadCourseByWhere = async (strapi, where) => {
  if (!where || typeof where !== 'object') return null;

  if (where.id !== undefined && where.id !== null) {
    return strapi.db.query(COURSE_UID).findOne({ where: { id: where.id } });
  }

  if (where.documentId) {
    return strapi.db.query(COURSE_UID).findOne({ where: { documentId: where.documentId } });
  }

  return null;
};

const prepareCoursePricingData = async (strapi, data, where) => {
  const existingCourse = await loadCourseByWhere(strapi, where);
  const settings = await loadPricingSettings(strapi);
  const discountPercent = resolveCourseDiscountPercent(existingCourse || data, settings);
  const pricing = resolveCoursePricing(data, existingCourse, { discountPercent });
  const scheduledIncreaseIds = resolveScheduledIncreaseIds(existingCourse || data, settings);

  return {
    ...pricing,
    scheduledIncreaseIds,
  };
};

const assertCourseIsUnique = async (strapi, data, where = null) => {
  const existingCourse = await loadCourseByWhere(strapi, where);
  const candidate = {
    ...(existingCourse || {}),
    ...(data || {}),
  };
  const candidateKey = buildCourseUniquenessKey(candidate);
  if (!candidateKey) return;

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
    + `для этой даты/ссылки. Используйте существующую запись вместо повторного создания.`
  );
};

const syncCourseRecord = async (strapi, course, settings, sourceData = null) => {
  if (!course || !course.id) return false;

  const discountPercent = resolveCourseDiscountPercent(course, settings);
  const pricing = resolveCoursePricing(sourceData || {}, course, { discountPercent });
  const scheduledIncreaseIds = resolveScheduledIncreaseIds(course, settings);
  if (!hasCoursePricingDiff(course, pricing) && !hasCourseScheduledIncreaseIdsDiff(course, scheduledIncreaseIds)) return false;

  await strapi.db.query(COURSE_UID).update({
    where: { id: course.id },
    data: {
      ...pricing,
      scheduledIncreaseIds,
    },
  });

  Object.assign(course, pricing, { scheduledIncreaseIds });
  return true;
};

const loadPricingSettingsRecord = async (strapi) => {
  const items = await strapi.db.query(PRICING_SETTINGS_UID).findMany({
    limit: 1,
  });

  return items[0] || null;
};

const loadPopulatedPricingSettings = async (strapi, settingsId) => {
  if (!settingsId) return null;

  return strapi.db.query(PRICING_SETTINGS_UID).findOne({
    where: { id: settingsId },
    populate: {
      scheduledIncreases: {
        populate: ['courses'],
      },
      courseDiscounts: {
        populate: ['courses'],
      },
    },
  });
};

const loadPricingSettingsWithoutRepair = async (strapi) => {
  const settings = await loadPricingSettingsRecord(strapi);
  if (!settings) return null;

  return loadPopulatedPricingSettings(strapi, settings.id);
};

const loadPricingSettings = async (strapi) => {
  const settings = await loadPricingSettingsRecord(strapi);
  if (!settings) return null;

  await repairPricingSettingsComponents(strapi, settings.id);

  return loadPopulatedPricingSettings(strapi, settings.id);
};

const loadPricingSettingsComponentLinks = async (strapi, settingsId, field) => {
  if (!settingsId) return [];

  return strapi.db.connection(PRICING_SETTINGS_COMPONENTS_TABLE)
    .select(['id', 'cmp_id', 'field', 'order', 'component_type'])
    .where({ entity_id: settingsId, field })
    .orderBy([{ column: 'order', order: 'asc' }, { column: 'id', order: 'asc' }]);
};

const dedupePricingSettingsComponentLinks = async (strapi, settingsId, field, componentType = '') => {
  const links = await loadPricingSettingsComponentLinks(strapi, settingsId, field);
  if (!links.length) return { removed: 0, reordered: 0 };

  const seenCmpIds = new Set();
  const linksToKeep = [];
  const linksToDelete = [];

  for (const link of links) {
    if (!link || !link.cmp_id) continue;

    if (seenCmpIds.has(link.cmp_id)) {
      linksToDelete.push(link.id);
      continue;
    }

    seenCmpIds.add(link.cmp_id);
    linksToKeep.push(link);
  }

  let reordered = 0;

  for (let index = 0; index < linksToKeep.length; index += 1) {
    const nextOrder = index + 1;
    const currentLink = linksToKeep[index];
    const nextComponentType = componentType || currentLink.component_type || null;
    const hasOrderDiff = Number(currentLink.order) !== nextOrder;
    const hasComponentTypeDiff = nextComponentType !== (currentLink.component_type || null);
    if (!hasOrderDiff && !hasComponentTypeDiff) continue;

    await strapi.db.connection(PRICING_SETTINGS_COMPONENTS_TABLE)
      .where({ id: currentLink.id })
      .update({
        order: nextOrder,
        component_type: nextComponentType,
      });

    reordered += 1;
  }

  if (linksToDelete.length) {
    await strapi.db.connection(PRICING_SETTINGS_COMPONENTS_TABLE)
      .whereIn('id', linksToDelete)
      .del();
  }

  return {
    removed: linksToDelete.length,
    reordered,
  };
};

const removeUnlinkedComponents = async (strapi, settingsId, field, componentType, componentTable) => {
  if (!settingsId) return 0;

  const linkedCmpIds = await strapi.db.connection(PRICING_SETTINGS_COMPONENTS_TABLE)
    .pluck('cmp_id')
    .where({
      entity_id: settingsId,
      field,
    });

  if (!linkedCmpIds.length) return 0;

  const existingComponentIds = await strapi.db.connection(componentTable)
    .pluck('id')
    .whereIn('id', linkedCmpIds);

  const existingIdsSet = new Set(existingComponentIds.map((value) => Number(value)));
  const staleCmpIds = linkedCmpIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && !existingIdsSet.has(value));

  if (!staleCmpIds.length) return 0;

  await strapi.db.connection(PRICING_SETTINGS_COMPONENTS_TABLE)
    .where({
      entity_id: settingsId,
      field,
      component_type: componentType,
    })
    .whereIn('cmp_id', staleCmpIds)
    .del();

  return staleCmpIds.length;
};

const repairPricingSettingsComponents = async (strapi, settingsId) => {
  if (!settingsId) return { repaired: false };

  for (const [field, config] of Object.entries(PRICING_SETTINGS_COMPONENT_FIELDS)) {
    await dedupePricingSettingsComponentLinks(strapi, settingsId, field, config.componentType);
    await removeUnlinkedComponents(strapi, settingsId, field, config.componentType, config.componentTable);
    await dedupePricingSettingsComponentLinks(strapi, settingsId, field, config.componentType);
  }

  await normalizePricingSettingsState(strapi, settingsId);

  return { repaired: true };
};

const normalizePriceIncreaseApplyMode = (value) => {
  const raw = toTrimmedString(value, 80);
  return raw === PRICE_INCREASE_APPLY_SELECTED ? PRICE_INCREASE_APPLY_SELECTED : PRICE_INCREASE_APPLY_ALL;
};

const extractRelationCourseIds = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((course) => {
      if (typeof course === 'number') return parseInteger(course);
      return parseInteger(course && course.id);
    })
    .filter((value) => Number.isFinite(value));
};

const normalizeScheduledIncreaseIds = (value) => {
  const source = Array.isArray(value) ? value : [];

  return source
    .map((item) => parseInteger(item))
    .filter((item) => Number.isFinite(item))
    .filter((item, index, list) => list.indexOf(item) === index)
    .sort((left, right) => left - right);
};

const sanitizeScheduledIncreaseItem = (item = {}, existingItem = null) => {
  const applyMode = normalizePriceIncreaseApplyMode(
    item.applyMode !== undefined ? item.applyMode : (existingItem && existingItem.applyMode)
  );

  return {
    ...(item && item.id ? { id: item.id } : {}),
    effectiveDate: toTrimmedString(item.effectiveDate || (existingItem && existingItem.effectiveDate), 32) || null,
    effectiveTime: normalizeTimeValue(item.effectiveTime || (existingItem && existingItem.effectiveTime)),
    percent: normalizePercent(item.percent !== undefined ? item.percent : (existingItem && existingItem.percent)),
    applyMode,
    active: item.active !== undefined ? item.active === true : (existingItem ? existingItem.active !== false : true),
    comment: toTrimmedString(item.comment !== undefined ? item.comment : (existingItem && existingItem.comment), 255) || null,
    courses: applyMode === PRICE_INCREASE_APPLY_SELECTED
      ? sanitizeDiscountCourses(
        item.courses,
        existingItem && Array.isArray(existingItem.courses) ? existingItem.courses : []
      )
      : [],
    applied: existingItem ? existingItem.applied === true : false,
    appliedAt: existingItem ? existingItem.appliedAt || null : null,
  };
};

const sanitizeDiscountCourses = (value, existingValue = []) => {
  const source = Array.isArray(value)
    ? value
    : (Array.isArray(existingValue) ? existingValue : []);
  const seenKeys = new Set();

  return source
    .map((item) => {
      if (typeof item === 'number') {
        const id = parseInteger(item);
        return Number.isFinite(id) ? { id } : null;
      }

      const id = parseInteger(item && item.id);
      const documentId = toTrimmedString(item && item.documentId, 64);
      if (!Number.isFinite(id) && !documentId) return null;

      const normalized = {};
      if (Number.isFinite(id)) normalized.id = id;
      if (documentId) normalized.documentId = documentId;
      return normalized;
    })
    .filter((item) => {
      if (!item) return false;

      const key = item.id ? `id:${item.id}` : `documentId:${item.documentId}`;
      if (seenKeys.has(key)) return false;

      seenKeys.add(key);
      return true;
    });
};

const sanitizeCourseDiscountItem = (item = {}, existingItem = null) => ({
  ...(item && item.id ? { id: item.id } : {}),
  title: toTrimmedString(item.title !== undefined ? item.title : (existingItem && existingItem.title), 255) || null,
  percent: normalizePercent(item.percent !== undefined ? item.percent : (existingItem && existingItem.percent)),
  active: item.active !== undefined ? item.active === true : (existingItem ? existingItem.active !== false : true),
  courses: sanitizeDiscountCourses(
    item.courses,
    existingItem && Array.isArray(existingItem.courses) ? existingItem.courses : []
  ),
});

const validateUniqueDiscountCourses = (courseDiscounts = []) => {
  const assignedCourses = new Map();

  for (let discountIndex = 0; discountIndex < courseDiscounts.length; discountIndex += 1) {
    const discount = courseDiscounts[discountIndex];
    if (!discount) continue;

    const discountLabel = toTrimmedString(discount.title, 255) || `Скидка #${discountIndex + 1}`;
    const courses = Array.isArray(discount.courses) ? discount.courses : [];

    for (const course of courses) {
      const courseId = parseInteger(course && course.id);
      const courseDocumentId = toTrimmedString(course && course.documentId, 64);
      const courseTitle = toTrimmedString(course && course.title, 255) || `Курс #${courseId || courseDocumentId || '?'}`;
      const courseKey = Number.isFinite(courseId) ? `id:${courseId}` : `documentId:${courseDocumentId}`;

      if (!courseKey || courseKey === 'documentId:') continue;

      const existingDiscountLabel = assignedCourses.get(courseKey);
      if (existingDiscountLabel) {
        throw new ValidationError(
          `Курс "${courseTitle}" уже добавлен в скидку "${existingDiscountLabel}". Один курс можно указать только в одной скидке.`
        );
      }

      assignedCourses.set(courseKey, discountLabel);
    }
  }
};

const validateScheduledIncreaseTargets = (scheduledIncreases = []) => {
  for (let increaseIndex = 0; increaseIndex < scheduledIncreases.length; increaseIndex += 1) {
    const increase = scheduledIncreases[increaseIndex];
    if (!increase) continue;

    if (normalizePriceIncreaseApplyMode(increase.applyMode) !== PRICE_INCREASE_APPLY_SELECTED) continue;

    const courseIds = extractRelationCourseIds(increase.courses);
    if (courseIds.length) continue;

    throw new ValidationError(
      `Для повышения #${increaseIndex + 1} нужно выбрать хотя бы один курс, если включен режим "${PRICE_INCREASE_APPLY_SELECTED}".`
    );
  }
};

const buildNormalizedCourseRefKeys = (courses = []) => {
  return (Array.isArray(courses) ? courses : [])
    .map((course) => {
      const courseId = parseInteger(course && course.id);
      const courseDocumentId = toTrimmedString(course && course.documentId, 64);
      return Number.isFinite(courseId) ? `id:${courseId}` : (courseDocumentId ? `documentId:${courseDocumentId}` : '');
    })
    .filter(Boolean)
    .sort();
};

const buildScheduledIncreaseFingerprint = (item = {}) => {
  const courseKeys = buildNormalizedCourseRefKeys(item.courses);
  return [
    toTrimmedString(item.effectiveDate, 32),
    normalizeTimeValue(item.effectiveTime),
    String(normalizePercent(item.percent)),
    normalizePriceIncreaseApplyMode(item.applyMode),
    item.active === false ? '0' : '1',
    toTrimmedString(item.comment, 255),
    courseKeys.join('|'),
  ].join('::');
};

const buildCourseDiscountFingerprint = (item = {}) => {
  const courseKeys = buildNormalizedCourseRefKeys(item.courses);
  return [
    toTrimmedString(item.title, 255),
    String(normalizePercent(item.percent)),
    item.active === false ? '0' : '1',
    courseKeys.join('|'),
  ].join('::');
};

const choosePreferredDuplicateItem = (existing, candidate) => {
  const existingId = parseInteger(existing && existing.id);
  const candidateId = parseInteger(candidate && candidate.id);

  if (existing && existing.applied === true && (!candidate || candidate.applied !== true)) {
    return existing;
  }

  if (candidate && candidate.applied === true && (!existing || existing.applied !== true)) {
    return candidate;
  }

  if (Number.isFinite(existingId) && !Number.isFinite(candidateId)) return existing;
  if (!Number.isFinite(existingId) && Number.isFinite(candidateId)) return candidate;

  return existing || candidate || null;
};

const mergeDuplicatePricingItems = (existing, candidate, options = {}) => {
  const preserveAppliedState = options && options.preserveAppliedState === true;
  const preferred = choosePreferredDuplicateItem(existing, candidate) || existing || candidate || {};
  const fallback = preferred === existing ? candidate : existing;
  const merged = {
    ...(fallback || {}),
    ...(preferred || {}),
    id: parseInteger(preferred && preferred.id) || parseInteger(fallback && fallback.id) || undefined,
  };

  if (preserveAppliedState) {
    merged.applied = (preferred && preferred.applied === true) || (fallback && fallback.applied === true);
    merged.appliedAt = toTrimmedString(
      (preferred && preferred.appliedAt) || (fallback && fallback.appliedAt),
      64
    ) || null;
  }

  return merged;
};

const dedupePricingItems = (items, fingerprintBuilder, options = {}) => {
  const list = Array.isArray(items) ? items : [];
  const seenIds = new Set();
  const seenFingerprints = new Map();
  const result = [];

  for (const item of list) {
    if (!item) continue;

    const itemId = parseInteger(item.id);
    if (Number.isFinite(itemId) && seenIds.has(itemId)) {
      continue;
    }

    const fingerprint = fingerprintBuilder(item);
    if (fingerprint && seenFingerprints.has(fingerprint)) {
      const existingIndex = seenFingerprints.get(fingerprint);
      result[existingIndex] = mergeDuplicatePricingItems(result[existingIndex], item, options);

      if (Number.isFinite(itemId)) {
        seenIds.add(itemId);
      }

      const mergedId = parseInteger(result[existingIndex] && result[existingIndex].id);
      if (Number.isFinite(mergedId)) {
        seenIds.add(mergedId);
      }

      continue;
    }

    if (Number.isFinite(itemId)) {
      seenIds.add(itemId);
    }

    if (fingerprint) {
      seenFingerprints.set(fingerprint, result.length);
    }

    result.push(item);
  }

  return result;
};

const buildScheduledIncreaseComparableState = (item = {}) => {
  return [
    String(parseInteger(item.id) || ''),
    buildScheduledIncreaseFingerprint(item),
    item.applied === true ? '1' : '0',
    toTrimmedString(item.appliedAt, 64),
  ].join('::');
};

const buildCourseDiscountComparableState = (item = {}) => {
  return [
    String(parseInteger(item.id) || ''),
    buildCourseDiscountFingerprint(item),
  ].join('::');
};

const havePricingItemsChanged = (currentItems, normalizedItems, stateBuilder) => {
  const current = Array.isArray(currentItems) ? currentItems : [];
  const normalized = Array.isArray(normalizedItems) ? normalizedItems : [];

  if (current.length !== normalized.length) return true;

  return current.some((item, index) => stateBuilder(item) !== stateBuilder(normalized[index]));
};

const sanitizePricingSettingsData = async (strapi, data, existingSettings = null) => {
  const input = {
    ...(data || {}),
  };

  const hasScheduledIncreases = Object.prototype.hasOwnProperty.call(input, 'scheduledIncreases');
  const hasCourseDiscounts = Object.prototype.hasOwnProperty.call(input, 'courseDiscounts');

  if (!hasScheduledIncreases && !hasCourseDiscounts) {
    return input;
  }

  const existing = existingSettings || await loadPricingSettingsWithoutRepair(strapi);
  if (hasScheduledIncreases) {
    const existingById = new Map(
      (existing && Array.isArray(existing.scheduledIncreases) ? existing.scheduledIncreases : [])
        .filter((item) => item && item.id)
        .map((item) => [item.id, item])
    );

    input.scheduledIncreases = (Array.isArray(input.scheduledIncreases) ? input.scheduledIncreases : [])
      .map((item) => sanitizeScheduledIncreaseItem(item, item && item.id ? existingById.get(item.id) || null : null));
    input.scheduledIncreases = dedupePricingItems(
      input.scheduledIncreases,
      buildScheduledIncreaseFingerprint,
      { preserveAppliedState: true }
    );

    validateScheduledIncreaseTargets(input.scheduledIncreases);
  }

  if (hasCourseDiscounts) {
    const existingById = new Map(
      (existing && Array.isArray(existing.courseDiscounts) ? existing.courseDiscounts : [])
        .filter((item) => item && item.id)
        .map((item) => [item.id, item])
    );

    input.courseDiscounts = (Array.isArray(input.courseDiscounts) ? input.courseDiscounts : [])
      .map((item) => sanitizeCourseDiscountItem(item, item && item.id ? existingById.get(item.id) || null : null));
    input.courseDiscounts = dedupePricingItems(input.courseDiscounts, buildCourseDiscountFingerprint);

    validateUniqueDiscountCourses(input.courseDiscounts);
  }

  return input;
};

const normalizePricingSettingsState = async (strapi, settingsId) => {
  if (!settingsId || isPricingSettingsNormalizationRunning) return { normalized: false };

  const current = await loadPopulatedPricingSettings(strapi, settingsId);
  if (!current) return { normalized: false };

  const normalized = await sanitizePricingSettingsData(strapi, {
    scheduledIncreases: current.scheduledIncreases,
    courseDiscounts: current.courseDiscounts,
  }, current);

  const hasScheduledIncreasesDiff = havePricingItemsChanged(
    current.scheduledIncreases,
    normalized.scheduledIncreases,
    buildScheduledIncreaseComparableState
  );
  const hasCourseDiscountsDiff = havePricingItemsChanged(
    current.courseDiscounts,
    normalized.courseDiscounts,
    buildCourseDiscountComparableState
  );

  if (!hasScheduledIncreasesDiff && !hasCourseDiscountsDiff) {
    return { normalized: false };
  }

  isPricingSettingsNormalizationRunning = true;

  try {
    await strapi.db.query(PRICING_SETTINGS_UID).update({
      where: { id: settingsId },
      data: normalized,
    });
  } finally {
    isPricingSettingsNormalizationRunning = false;
  }

  return { normalized: true };
};

const buildEffectiveDateTime = (item) => {
  if (!item || !item.effectiveDate) return null;
  const effectiveTime = normalizeTimeValue(item.effectiveTime);
  const parsed = new Date(`${item.effectiveDate}T${effectiveTime}${APP_UTC_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serializeScheduledIncrease = (item) => ({
  id: item && item.id ? item.id : null,
  effectiveDate: item && item.effectiveDate ? item.effectiveDate : null,
  effectiveTime: normalizeTimeValue(item && item.effectiveTime),
  effectiveAt: buildEffectiveAtValue(item && item.effectiveDate, item && item.effectiveTime),
  utcOffset: APP_UTC_OFFSET,
  percent: normalizePercent(item && item.percent),
  applyMode: normalizePriceIncreaseApplyMode(item && item.applyMode),
  appliesToAll: normalizePriceIncreaseApplyMode(item && item.applyMode) === PRICE_INCREASE_APPLY_ALL,
  courses: Array.isArray(item && item.courses)
    ? item.courses.map((course) => ({
      id: parseInteger(course && course.id),
      documentId: toTrimmedString(course && course.documentId, 120) || null,
      title: toTrimmedString(course && course.title, 255) || null,
      slug: toTrimmedString(course && course.slug, 255) || null,
    })).filter((course) => Number.isFinite(course.id) || course.documentId)
    : [],
  active: item ? item.active !== false : false,
  applied: item ? item.applied === true : false,
  appliedAt: item && item.appliedAt ? item.appliedAt : null,
  comment: toTrimmedString(item && item.comment, 255) || null,
});

const getUpcomingScheduledIncreases = (settings, now = new Date()) => {
  if (!settings || !Array.isArray(settings.scheduledIncreases)) return [];

  return settings.scheduledIncreases
    .filter((item) => item && item.active !== false && item.applied !== true)
    .map((item) => ({
      item,
      effectiveDateTime: buildEffectiveDateTime(item),
    }))
    .filter((entry) => entry.effectiveDateTime && entry.effectiveDateTime.getTime() > now.getTime())
    .sort((left, right) => left.effectiveDateTime.getTime() - right.effectiveDateTime.getTime())
    .map((entry) => serializeScheduledIncrease(entry.item));
};

const scheduledIncreaseAppliesToCourse = (increase, course) => {
  if (!increase) return false;

  if (normalizePriceIncreaseApplyMode(increase.applyMode) === PRICE_INCREASE_APPLY_ALL) {
    return true;
  }

  const courseId = parseInteger(course && course.id);
  if (!Number.isFinite(courseId)) return false;

  const selectedCourseIds = extractRelationCourseIds(increase.courses);
  return selectedCourseIds.includes(courseId);
};

const resolveScheduledIncreaseIds = (course, settings) => {
  if (!settings || !Array.isArray(settings.scheduledIncreases)) return [];

  return settings.scheduledIncreases
    .filter((increase) => increase && increase.active !== false && increase.applied !== true)
    .filter((increase) => scheduledIncreaseAppliesToCourse(increase, course))
    .sort((left, right) => {
      const leftTs = (buildEffectiveDateTime(left) || new Date('9999-12-31T23:59:59')).getTime();
      const rightTs = (buildEffectiveDateTime(right) || new Date('9999-12-31T23:59:59')).getTime();
      return leftTs - rightTs;
    })
    .map((increase) => parseInteger(increase.id))
    .filter((id) => Number.isFinite(id));
};

const buildCoursePriceIncreaseInfo = (course, settings, now = new Date()) => {
  const currentBasePrice = parseInteger(course && course.basePrice);
  const currentPrice = parseInteger(course && course.price);
  const activeDiscount = resolveCourseDiscount(course, settings);
  const discountPercent = activeDiscount ? activeDiscount.percent : normalizePercent(course && course.discountPercent);
  const upcomingIncreases = getUpcomingScheduledIncreases(settings, now)
    .filter((increase) => scheduledIncreaseAppliesToCourse(increase, course));

  let simulatedBasePrice = Number.isFinite(currentBasePrice) ? currentBasePrice : null;

  const projectedIncreases = upcomingIncreases.map((increase) => {
    const effectiveDateLabel = formatDateLabelRu(increase.effectiveDate);
    if (!Number.isFinite(simulatedBasePrice)) {
      return {
        ...increase,
        effectiveDateLabel,
        label: effectiveDateLabel ? `Цена с ${effectiveDateLabel}` : 'Цена позже',
        projectedBasePrice: null,
        projectedPrice: null,
        projectedDiscountPercent: discountPercent,
        projectedPriceLabel: '',
      };
    }

    simulatedBasePrice = Math.max(0, Math.round(simulatedBasePrice * ((100 + increase.percent) / 100)));
    const projectedPrice = applyDiscount(simulatedBasePrice, discountPercent);

    return {
      ...increase,
      effectiveDateLabel,
      label: effectiveDateLabel ? `Цена с ${effectiveDateLabel}` : 'Цена позже',
      projectedBasePrice: simulatedBasePrice,
      projectedPrice: buildStoredPrice({ discountedPrice: projectedPrice }),
      projectedDiscountPercent: discountPercent,
      projectedPriceLabel: formatPriceDisplay(projectedPrice),
    };
  });

  return {
    currentBasePrice: Number.isFinite(currentBasePrice) ? currentBasePrice : null,
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
    currentPriceLabel: formatPriceDisplay(currentPrice),
    activeDiscount,
    discountPercent,
    nextIncrease: projectedIncreases[0] || null,
    upcomingIncreases: projectedIncreases,
  };
};

const formatTimestampWithoutTimezone = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const shifted = new Date(date.getTime() + (APP_UTC_OFFSET_MINUTES * 60 * 1000));
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  const seconds = String(shifted.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(shifted.getUTCMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const isIncreaseDue = (item, now) => {
  if (!item || item.active === false || item.applied === true) return false;
  const effectiveDateTime = buildEffectiveDateTime(item);
  if (!effectiveDateTime) return false;
  return effectiveDateTime.getTime() <= now.getTime();
};

const applyScheduledIncreases = async (strapi, settings, courses) => {
  if (!settings || !settings.id) return 0;

  const now = new Date();
  const dueIncreases = (Array.isArray(settings.scheduledIncreases) ? settings.scheduledIncreases : [])
    .filter((item) => isIncreaseDue(item, now))
    .sort((left, right) => {
      const leftTs = (buildEffectiveDateTime(left) || new Date('1970-01-01T00:00:00')).getTime();
      const rightTs = (buildEffectiveDateTime(right) || new Date('1970-01-01T00:00:00')).getTime();
      return leftTs - rightTs;
    });

  if (!dueIncreases.length) return 0;

  const appliedAt = formatTimestampWithoutTimezone(now);
  const rowLockingEnabled = supportsSelectForUpdate(strapi);
  const courseStateById = new Map(
    (Array.isArray(courses) ? courses : [])
      .filter((course) => course && course.id)
      .map((course) => [course.id, course])
  );
  const appliedIds = await strapi.db.connection.transaction(async (trx) => {
    const committedIds = [];

    for (const increase of dueIncreases) {
      const increaseId = parseInteger(increase && increase.id);
      if (!Number.isFinite(increaseId)) continue;

      let increaseQuery = trx(PRICE_INCREASE_COMPONENTS_TABLE)
        .select(['id', 'active', 'applied', 'percent'])
        .where({ id: increaseId });

      if (rowLockingEnabled && typeof increaseQuery.forUpdate === 'function') {
        increaseQuery = increaseQuery.forUpdate();
      }

      const lockedIncrease = await increaseQuery.first();
      if (!lockedIncrease || lockedIncrease.active === false || lockedIncrease.applied === true) {
        continue;
      }

      const percent = normalizePercent(lockedIncrease.percent !== undefined ? lockedIncrease.percent : increase.percent);
      if (!percent) continue;

      const targetCourses = courses.filter((course) => scheduledIncreaseAppliesToCourse(increase, course));
      if (!targetCourses.length) continue;

      for (const course of targetCourses) {
        const courseId = parseInteger(course && course.id);
        if (!Number.isFinite(courseId)) continue;

        let courseQuery = trx('courses')
          .select(['id', 'base_price'])
          .where({ id: courseId });

        if (rowLockingEnabled && typeof courseQuery.forUpdate === 'function') {
          courseQuery = courseQuery.forUpdate();
        }

        const lockedCourse = await courseQuery.first();
        if (!lockedCourse) continue;

        const currentCourse = courseStateById.get(courseId) || course;
        const basePrice = parseInteger(
          lockedCourse.base_price !== undefined ? lockedCourse.base_price : currentCourse.basePrice
        );
        if (!Number.isFinite(basePrice)) continue;

        const nextBasePrice = Math.max(0, Math.round(basePrice * ((100 + percent) / 100)));
        await trx('courses')
          .where({ id: courseId })
          .update({ base_price: nextBasePrice });

        const synced = resolveCoursePricing({ basePrice: nextBasePrice }, currentCourse);
        Object.assign(currentCourse, { basePrice: nextBasePrice }, synced);
        courseStateById.set(courseId, currentCourse);
      }

      await trx(PRICE_INCREASE_COMPONENTS_TABLE)
        .where({ id: increaseId })
        .update({
          applied: true,
          applied_at: appliedAt,
        });

      committedIds.push(increaseId);
    }

    return committedIds;
  });

  if (!appliedIds.length) return 0;

  const appliedIdsSet = new Set(appliedIds);
  for (const item of settings.scheduledIncreases || []) {
    if (!appliedIdsSet.has(item.id)) continue;

    item.applied = true;
    item.appliedAt = appliedAt;
  }

  return appliedIds.length;
};

const syncPricingState = async (strapi) => {
  if (isPricingSyncRunning) return { skipped: true };

  isPricingSyncRunning = true;

  try {
    const courses = await strapi.db.query(COURSE_UID).findMany({
      orderBy: [{ id: 'asc' }],
    });

    const settings = await loadPricingSettings(strapi);
    const appliedIncreases = await applyScheduledIncreases(strapi, settings, courses);
    let changedCourses = 0;

    for (const course of courses) {
      const changed = await syncCourseRecord(strapi, course, settings);
      if (changed) changedCourses += 1;
    }

    return {
      skipped: false,
      changedCourses,
      appliedIncreases,
    };
  } finally {
    isPricingSyncRunning = false;
  }
};

const migrateCoursePriceToInteger = async (strapi) => {
  const clientName = toTrimmedString(
    strapi && strapi.db && strapi.db.connection && strapi.db.connection.client && strapi.db.connection.client.config
      ? strapi.db.connection.client.config.client
      : '',
    40
  ).toLowerCase();

  if (!clientName.includes('pg')) {
    return { skipped: true, reason: 'unsupported-client' };
  }

  const columnInfo = await strapi.db.connection('courses').columnInfo('price').catch(() => null);
  if (!columnInfo) {
    return { skipped: true, reason: 'missing-column' };
  }

  const columnType = toTrimmedString(columnInfo.type, 40).toLowerCase();
  if (PG_INTEGER_TYPES.has(columnType)) {
    return { skipped: true, reason: 'already-integer' };
  }

  const courses = await strapi.db.query(COURSE_UID).findMany({
    orderBy: [{ id: 'asc' }],
  });

  let updatedCourses = 0;

  for (const course of courses) {
    const pricing = resolveCoursePricing(course, null);
    const currentPrice = parseInteger(course.price);

    if (currentPrice === pricing.price) continue;

    await strapi.db.query(COURSE_UID).update({
      where: { id: course.id },
      data: { price: pricing.price },
    });

    updatedCourses += 1;
  }

  await strapi.db.connection.raw(`
    ALTER TABLE "courses"
    ALTER COLUMN "price" TYPE integer
    USING NULLIF(TRIM("price"::text), '')::integer
  `);

  return {
    skipped: false,
    updatedCourses,
  };
};

module.exports = {
  COURSE_UID,
  PRICING_SETTINGS_UID,
  applyDiscount,
  buildCoursePriceIncreaseInfo,
  buildStoredPrice,
  formatPriceDisplay,
  getUpcomingScheduledIncreases,
  loadPricingSettings,
  migrateCoursePriceToInteger,
  normalizePercent,
  normalizeTimeValue,
  parseInteger,
  prepareCoursePricingData,
  repairPricingSettingsComponents,
  resolveCourseDiscount,
  resolveCoursePricing,
  assertCourseIsUnique,
  sanitizePricingSettingsData,
  syncPricingState,
  loadPricingSettingsWithoutRepair,
  normalizePricingSettingsState,
};
