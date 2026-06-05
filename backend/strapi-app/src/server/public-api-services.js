'use strict';

const {
  COURSE_CONTENT_BLOCKS_POPULATE,
  serializeCourse,
} = require('../utils/tilda-course');
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
      contentBlocks: COURSE_CONTENT_BLOCKS_POPULATE,
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
  buildRobotsTxt,
  buildSitemapXml,
  checkDatabaseHealth,
  loadSerializedCourses,
  normalizePublicBaseUrl,
  parseSeoStaticPaths,
};
