'use strict';

const {
  buildCoursePriceIncreaseInfo,
  resolveCourseDiscount,
} = require('./pricing');

const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const MONTHS_GENITIVE = [
  'Января',
  'Февраля',
  'Марта',
  'Апреля',
  'Мая',
  'Июня',
  'Июля',
  'Августа',
  'Сентября',
  'Октября',
  'Ноября',
  'Декабря',
];

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const SLUG_CHAR_MAP = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const PUBLIC_COURSE_FIELDS = [
  'id',
  'documentId',
  'slug',
  'title',
  'comment',
  'publish',
  'waitlist',
  'courseStatus',
  'date',
  'day',
  'month',
  'monthLabel',
  'weekdayShort',
  'dateLabel',
  'studyDays',
  'hours',
  'hoursLabel',
  'basePrice',
  'discountPercent',
  'discountedPrice',
  'price',
  'scheduledIncreaseIds',
  'activeDiscount',
  'nextPriceIncrease',
  'upcomingPriceIncreases',
  'educationDocument',
  'courseLink',
  'coursePath',
];

const toTrimmedString = (value, maxLen = 1000) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return '';

  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLen);
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

const normalizeBooleanQuery = (value) => {
  const text = toTrimmedString(value, 20).toLowerCase();
  if (!text) return null;

  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return null;
};

const transliterate = (value) => {
  return Array.from(String(value || ''))
    .map((char) => {
      const lowerChar = char.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(SLUG_CHAR_MAP, lowerChar)) {
        return SLUG_CHAR_MAP[lowerChar];
      }
      return lowerChar;
    })
    .join('');
};

const slugify = (value) => {
  const transliterated = transliterate(value);
  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

const normalizePathname = (value) => {
  const text = toTrimmedString(value, 500);
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
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    return '';
  }
};

const extractPathFromCourseLink = (courseLink) => {
  const normalizedUrl = normalizeAbsoluteUrl(courseLink);
  if (normalizedUrl) {
    try {
      return normalizePathname(new URL(normalizedUrl).pathname);
    } catch (error) {
      return '';
    }
  }

  return normalizePathname(courseLink);
};

const buildDateParts = (dateValue) => {
  const rawDate = toTrimmedString(dateValue, 40);
  if (!rawDate) {
    return {
      date: '',
      day: '',
      month: '',
      monthLabel: '',
      weekdayShort: '',
      dateLabel: '',
    };
  }

  const parsed = new Date(`${rawDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return {
      date: rawDate,
      day: '',
      month: '',
      monthLabel: '',
      weekdayShort: '',
      dateLabel: '',
    };
  }

  const day = String(parsed.getDate()).padStart(2, '0');
  const monthIndex = parsed.getMonth();
  const month = MONTHS_NOMINATIVE[monthIndex] || '';
  const monthLabel = MONTHS_GENITIVE[monthIndex] || '';
  const weekdayShort = WEEKDAYS_SHORT[parsed.getDay()] || '';
  const dateLabel = monthLabel && weekdayShort ? `${monthLabel}, ${weekdayShort}` : monthLabel;

  return {
    date: rawDate,
    day,
    month,
    monthLabel,
    weekdayShort,
    dateLabel,
  };
};

const deriveCourseSlug = (course) => {
  const explicitSlug = slugify(course && course.slug);
  if (explicitSlug) return explicitSlug;

  const coursePath = extractPathFromCourseLink(course && course.courseLink);
  if (coursePath && coursePath !== '/') {
    const lastSegment = coursePath.split('/').filter(Boolean).pop();
    const pathSlug = slugify(lastSegment);
    if (pathSlug) return pathSlug;
  }

  return slugify(course && course.title);
};

const serializeCourse = (course, options = {}) => {
  const settings = options && options.settings ? options.settings : null;
  const dateParts = buildDateParts(course && course.date);
  const coursePath = extractPathFromCourseLink(course && course.courseLink);
  const courseStatus = toTrimmedString(course && (course.courseStatus || course.status), 120) || 'Идет набор';
  const hours = Number.isFinite(course && course.hours) ? course.hours : (course && course.hours) || null;
  const basePrice = Number.isFinite(course && course.basePrice) ? course.basePrice : (course && course.basePrice) || null;
  const discountPercent = Number.isFinite(course && course.discountPercent)
    ? course.discountPercent
    : ((course && course.discountPercent) || 0);
  const discountedPrice = Number.isFinite(course && course.discountedPrice)
    ? course.discountedPrice
    : (course && course.discountedPrice) || null;
  const price = parseInteger(course && course.price);
  const scheduledIncreaseIds = Array.isArray(course && course.scheduledIncreaseIds)
    ? course.scheduledIncreaseIds
      .map((value) => parseInteger(value))
      .filter((value) => Number.isFinite(value))
    : [];
  const pricingInfo = settings ? buildCoursePriceIncreaseInfo(course, settings) : {
    activeDiscount: null,
    nextIncrease: null,
    upcomingIncreases: [],
  };
  const activeDiscount = settings ? resolveCourseDiscount(course, settings) : null;

  return {
    id: course && course.id ? course.id : null,
    documentId: toTrimmedString(course && course.documentId, 120) || null,
    slug: deriveCourseSlug(course),
    title: toTrimmedString(course && course.title, 255),
    comment: toTrimmedString(course && course.comment, 1000),
    publish: course ? course.publish !== false : true,
    waitlist: course ? course.waitlist === true : false,
    courseStatus,
    date: dateParts.date || null,
    day: dateParts.day,
    month: dateParts.month,
    monthLabel: dateParts.monthLabel,
    weekdayShort: dateParts.weekdayShort,
    dateLabel: dateParts.dateLabel,
    studyDays: toTrimmedString(course && course.studyDays, 255),
    hours,
    hoursLabel: hours === null || hours === undefined || hours === '' ? '' : `${hours} ак. ч.`,
    basePrice,
    discountPercent,
    discountedPrice,
    price,
    scheduledIncreaseIds,
    activeDiscount: pricingInfo.activeDiscount || activeDiscount,
    nextPriceIncrease: pricingInfo.nextIncrease || null,
    upcomingPriceIncreases: Array.isArray(pricingInfo.upcomingIncreases) ? pricingInfo.upcomingIncreases : [],
    educationDocument: toTrimmedString(course && course.educationDocument, 120),
    courseLink: toTrimmedString(course && course.courseLink, 1000),
    coursePath,
  };
};

const normalizeRequestedFields = (value) => {
  const raw = Array.isArray(value) ? value.join(',') : toTrimmedString(value, 1000);
  if (!raw) return [];

  return raw
    .split(',')
    .map((field) => toTrimmedString(field, 80))
    .filter(Boolean)
    .filter((field, index, list) => PUBLIC_COURSE_FIELDS.includes(field) && list.indexOf(field) === index);
};

const pickCourseFields = (course, requestedFields) => {
  if (!requestedFields || !requestedFields.length) return course;

  return requestedFields.reduce((acc, field) => {
    acc[field] = Object.prototype.hasOwnProperty.call(course, field) ? course[field] : null;
    return acc;
  }, {});
};

const matchesIdentifier = (course, identifier) => {
  const raw = toTrimmedString(identifier, 500);
  if (!raw) return false;

  const normalizedIdentifier = raw.toLowerCase();
  const normalizedPath = normalizePathname(raw).toLowerCase();
  const normalizedUrl = normalizeAbsoluteUrl(raw).toLowerCase();

  const courseId = course.id === null || course.id === undefined ? '' : String(course.id).toLowerCase();
  const documentId = toTrimmedString(course.documentId, 120).toLowerCase();
  const slug = toTrimmedString(course.slug, 255).toLowerCase();
  const coursePath = normalizePathname(course.coursePath).toLowerCase();
  const courseUrl = normalizeAbsoluteUrl(course.courseLink).toLowerCase();
  const title = toTrimmedString(course.title, 255).toLowerCase();

  if (normalizedIdentifier === courseId) return true;
  if (normalizedIdentifier === documentId) return true;
  if (normalizedIdentifier === slug) return true;
  if (normalizedIdentifier === title) return true;
  if (normalizedIdentifier === coursePath) return true;
  if (normalizedUrl && normalizedUrl === courseUrl) return true;
  if (normalizedPath && normalizedPath === coursePath) return true;

  return false;
};

const getMatchScore = (course, identifier) => {
  const raw = toTrimmedString(identifier, 500);
  if (!raw) return -1;

  const normalizedIdentifier = raw.toLowerCase();
  const normalizedPath = normalizePathname(raw).toLowerCase();
  const normalizedUrl = normalizeAbsoluteUrl(raw).toLowerCase();

  const courseId = course.id === null || course.id === undefined ? '' : String(course.id).toLowerCase();
  const documentId = toTrimmedString(course.documentId, 120).toLowerCase();
  const slug = toTrimmedString(course.slug, 255).toLowerCase();
  const coursePath = normalizePathname(course.coursePath).toLowerCase();
  const courseUrl = normalizeAbsoluteUrl(course.courseLink).toLowerCase();
  const title = toTrimmedString(course.title, 255).toLowerCase();

  if (normalizedIdentifier === courseId) return 600;
  if (normalizedIdentifier === documentId) return 500;
  if (normalizedUrl && normalizedUrl === courseUrl) return 450;
  if (normalizedPath && normalizedPath === coursePath) return 400;
  if (normalizedIdentifier === slug) return 300;
  if (normalizedIdentifier === title) return 200;

  return -1;
};

const buildIdentifierCandidates = (query = {}, identifier = '') => {
  const rawCandidates = [
    identifier,
    query.id,
    query.documentId,
    query.slug,
    query.url,
    query.path,
    query.title,
  ];
  const seen = new Set();

  return rawCandidates
    .map((value) => toTrimmedString(value, 1000))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const filterCourses = (courses, query = {}) => {
  const waitlistFilter = normalizeBooleanQuery(query.waitlist);
  const includeUnpublished = normalizeBooleanQuery(query.includeUnpublished) === true;
  const requestedFields = normalizeRequestedFields(query.fields);
  const search = toTrimmedString(query.search || query.q, 255).toLowerCase();

  return courses
    .filter((course) => includeUnpublished || course.publish)
    .filter((course) => waitlistFilter === null || course.waitlist === waitlistFilter)
    .filter((course) => {
      if (!search) return true;
      const haystack = [
        course.title,
        course.comment,
        course.courseStatus,
        course.studyDays,
        course.educationDocument,
        course.slug,
        course.coursePath,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    })
    .map((course) => pickCourseFields(course, requestedFields));
};

const resolveSingleCourse = (courses, query = {}, identifier = '') => {
  const includeUnpublished = normalizeBooleanQuery(query.includeUnpublished) === true;
  const requestedFields = normalizeRequestedFields(query.fields);
  const candidates = buildIdentifierCandidates(query, identifier);

  if (!candidates.length) return null;

  let matchedCourse = null;
  let matchedScore = -1;

  for (const value of candidates) {
    for (const course of courses) {
      if (!includeUnpublished && !course.publish) continue;
      if (!matchesIdentifier(course, value)) continue;

      const score = getMatchScore(course, value);
      if (score <= matchedScore) continue;

      matchedCourse = course;
      matchedScore = score;
    }

    if (matchedScore >= 400) break;
  }

  return matchedCourse ? pickCourseFields(matchedCourse, requestedFields) : null;
};

module.exports = {
  PUBLIC_COURSE_FIELDS,
  filterCourses,
  normalizeRequestedFields,
  pickCourseFields,
  resolveSingleCourse,
  serializeCourse,
};
