'use strict';

const COURSE_UID = 'api::course.course';

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

const parsePlainInteger = (value) => {
  if (typeof value === 'number') {
    return parseInteger(value);
  }

  const raw = toTrimmedString(value, 255);
  if (!raw || !/^-?\d[\d\s]*$/.test(raw)) return null;

  return parseInteger(raw);
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

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
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    return '';
  }
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

const extractCourseRef = (value) => {
  const refs = extractCourseRefs(value);
  return refs.length
    ? refs[0]
    : { id: null, documentId: null };
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

const resolveCourseRelationIds = async (strapi, value, existingValue = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return resolveCourseIds(strapi, value);
  }

  if (hasOwn(value, 'set')) {
    return resolveCourseIds(strapi, value.set);
  }

  if (hasOwn(value, 'connect') || hasOwn(value, 'disconnect')) {
    const resolvedIds = new Set(await resolveCourseIds(strapi, existingValue));

    for (const id of await resolveCourseIds(strapi, value.disconnect || [])) {
      resolvedIds.delete(id);
    }

    for (const id of await resolveCourseIds(strapi, value.connect || [])) {
      resolvedIds.add(id);
    }

    return Array.from(resolvedIds);
  }

  return resolveCourseIds(strapi, value);
};

const resolveCourseRelationId = async (strapi, value, existingValue = null) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (hasOwn(value, 'set')) {
      const setIds = await resolveCourseIds(strapi, value.set);
      return setIds.length ? setIds[0] : null;
    }

    if (hasOwn(value, 'connect') || hasOwn(value, 'disconnect')) {
      const connectedIds = await resolveCourseIds(strapi, value.connect || []);
      if (connectedIds.length) {
        return connectedIds[connectedIds.length - 1];
      }

      const disconnectedIds = new Set(await resolveCourseIds(strapi, value.disconnect || []));
      const existingSource = Array.isArray(existingValue)
        ? existingValue
        : existingValue
          ? [existingValue]
          : [];
      const existingIds = await resolveCourseIds(strapi, existingSource);
      const remainingId = existingIds.find((id) => !disconnectedIds.has(id));
      return Number.isFinite(remainingId) ? remainingId : null;
    }
  }

  const ids = await resolveCourseIds(strapi, value);
  return ids.length ? ids[0] : null;
};

module.exports = {
  COURSE_UID,
  extractCourseRef,
  extractCourseRefs,
  loadCourseByRef,
  normalizeBoolean,
  normalizeAbsoluteUrl,
  normalizePathname,
  parseInteger,
  parsePlainInteger,
  resolveCourseIds,
  resolveCourseRelationId,
  resolveCourseRelationIds,
  safeDecodeURIComponent,
  toTrimmedString,
};
