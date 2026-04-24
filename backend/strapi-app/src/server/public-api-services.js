'use strict';

const { serializeCourse } = require('../utils/tilda-course');
const { COURSE_PRICE_CHANGES_FIELD } = require('../utils/course-price-increase');
const {
  normalizeAbsoluteUrl,
  normalizePathname,
  toTrimmedString,
} = require('../utils/course-reference');

const loadSerializedCourses = async (strapi) => {
  const courses = await strapi.db.query('api::course.course').findMany({
    populate: {
      discount: true,
      [COURSE_PRICE_CHANGES_FIELD]: true,
    },
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
  });

  return courses.map((course) => serializeCourse(course));
};

const checkDatabaseHealth = async (strapi) => {
  try {
    await strapi.db.connection.raw('select 1');
    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      error: toTrimmedString(error && error.message, 500) || 'Database is unavailable.',
    };
  }
};

const normalizePublicBaseUrl = (value) => {
  return normalizeAbsoluteUrl(value) || '';
};

const joinUrl = (baseUrl, pathname = '') => {
  const safeBaseUrl = normalizePublicBaseUrl(baseUrl);
  const safePathname = normalizePathname(pathname);

  if (!safeBaseUrl) return '';
  if (!safePathname || safePathname === '/') return safeBaseUrl;

  return `${safeBaseUrl}${safePathname}`;
};

const parseSeoStaticPaths = (value) => {
  const raw = typeof value === 'string' ? value : '';
  if (!raw) return [];

  return Array.from(new Set(
    raw
      .split(/[\n,]/)
      .map((item) => normalizePathname(item))
      .filter(Boolean)
  ));
};

const xmlEscape = (value) => {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const buildRobotsTxt = ({ publicUrl }) => {
  const baseUrl = normalizePublicBaseUrl(publicUrl);
  const lines = [
    'User-agent: *',
    'Allow: /',
  ];

  if (baseUrl) {
    lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
  }

  return `${lines.join('\n')}\n`;
};

const normalizeWhitespace = (value, maxLength = 0) => {
  const text = toTrimmedString(value, maxLength || undefined)
    .replace(/\s+/g, ' ')
    .trim();

  if (!maxLength || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
};

const formatPriceLabel = (value) => {
  const amount = Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';

  return `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
};

const sanitizeSentencePart = (value, maxLength = 0) => {
  return normalizeWhitespace(value, maxLength).replace(/[.!?]+$/g, '');
};

const resolveSeoTitle = ({ course, siteName, titleSuffix }) => {
  const courseTitle = normalizeWhitespace(course && course.title, 255);
  const safeSuffix = normalizeWhitespace(titleSuffix, 120);
  const safeSiteName = normalizeWhitespace(siteName, 120);

  if (safeSuffix) {
    return courseTitle ? `${courseTitle} ${safeSuffix}` : safeSuffix;
  }

  if (safeSiteName) {
    return courseTitle ? `${courseTitle} | ${safeSiteName}` : safeSiteName;
  }

  return courseTitle;
};

const resolveSeoDescription = (course, defaultDescription) => {
  const explicitComment = normalizeWhitespace(course && course.comment, 220);
  if (explicitComment) return explicitComment;

  const parts = [];
  const title = normalizeWhitespace(course && course.title, 255);
  const day = normalizeWhitespace(course && course.day, 40);
  const monthLabel = normalizeWhitespace(course && course.monthLabel, 80).toLowerCase();
  const studyDays = sanitizeSentencePart(course && course.studyDays, 120);
  const hoursLabel = sanitizeSentencePart(course && course.hoursLabel, 80);
  const priceLabel = formatPriceLabel(course && course.price);

  if (title) {
    parts.push(`Курс «${title}»`);
  }

  if (day && monthLabel) {
    parts.push(`Старт ${day} ${monthLabel}`);
  }

  if (studyDays) {
    parts.push(`Занятия ${studyDays}`);
  }

  if (hoursLabel) {
    parts.push(hoursLabel);
  }

  if (priceLabel) {
    parts.push(`Стоимость ${priceLabel}`);
  }

  if (!parts.length) {
    return normalizeWhitespace(defaultDescription, 220);
  }

  return normalizeWhitespace(parts.join('. '), 220);
};

const buildCourseSeoPayload = ({
  publicUrl,
  course,
  siteName = '',
  titleSuffix = '',
  defaultDescription = '',
}) => {
  const canonicalUrl = joinUrl(publicUrl, course && course.coursePath);
  const description = resolveSeoDescription(course, defaultDescription);
  const title = resolveSeoTitle({ course, siteName, titleSuffix });
  const image = normalizeAbsoluteUrl(course && (course.heroImg || course.catalogImg)) || '';
  const safeSiteName = normalizeWhitespace(siteName, 120);

  return {
    title,
    description,
    canonicalUrl,
    robots: 'index,follow',
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      title: title || normalizeWhitespace(course && course.title, 255),
      description,
      image,
      siteName: safeSiteName,
    },
  };
};

const buildSitemapXml = ({ publicUrl, staticPaths = [], courses = [] }) => {
  const baseUrl = normalizePublicBaseUrl(publicUrl);
  const pathSet = new Set(['/']);

  staticPaths.forEach((pathValue) => {
    const normalized = normalizePathname(pathValue);
    if (normalized) {
      pathSet.add(normalized);
    }
  });

  courses
    .filter((course) => course && course.publish !== false)
    .forEach((course) => {
      const coursePath = normalizePathname(course.coursePath);
      if (coursePath) {
        pathSet.add(coursePath);
      }
    });

  const urls = Array.from(pathSet)
    .map((pathname) => {
      if (!baseUrl) return '';
      return `${baseUrl}${pathname === '/' ? '' : pathname}`;
    })
    .filter(Boolean)
    .sort();

  const entries = urls
    .map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    '',
  ].join('\n');
};

module.exports = {
  buildCourseSeoPayload,
  buildRobotsTxt,
  buildSitemapXml,
  checkDatabaseHealth,
  joinUrl,
  loadSerializedCourses,
  normalizePublicBaseUrl,
  parseSeoStaticPaths,
};
