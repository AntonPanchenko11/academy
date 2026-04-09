'use strict';

const CORE_STORE_TABLE = 'strapi_core_store_settings';
const COURSE_UID = 'api::course.course';
const COURSE_KEY = `plugin_content_manager_configuration_content_types::${COURSE_UID}`;
const COURSE_PRICE_CHANGES_FIELD = 'priceChanges';
const LEGACY_COURSE_FIELDS = new Set(['priceIncreases', 'scheduledIncreaseIds', 'scheduledPriceIncreases']);

const parseJson = (value, fallback = null) => {
  try {
    return JSON.parse(String(value || ''));
  } catch (error) {
    return fallback;
  }
};

const normalizeLayoutRow = (row) => {
  return Array.isArray(row) ? row.filter((item) => item && typeof item === 'object' && item.name) : [];
};

const normalizeCourseEditLayout = (rows) => {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeLayoutRow(row).filter((item) => !LEGACY_COURSE_FIELDS.has(item.name)))
    .filter((row) => row.length);

  const rowsWithoutPriceChanges = normalizedRows
    .map((row) => row.filter((item) => item.name !== COURSE_PRICE_CHANGES_FIELD))
    .filter((row) => row.length);

  return [...rowsWithoutPriceChanges, [{ name: COURSE_PRICE_CHANGES_FIELD, size: 12 }]];
};

const normalizeCourseListLayout = (fields) => {
  return (Array.isArray(fields) ? fields : [])
    .filter((field) => typeof field === 'string' && !LEGACY_COURSE_FIELDS.has(field));
};

const normalizeCourseMetadatas = (metadatas) => {
  const nextMetadatas = {
    ...(metadatas && typeof metadatas === 'object' ? metadatas : {}),
  };

  LEGACY_COURSE_FIELDS.forEach((field) => {
    delete nextMetadatas[field];
  });

  return nextMetadatas;
};

const loadStoreConfig = async (strapi, key) => {
  return strapi.db.connection(CORE_STORE_TABLE)
    .select(['id', 'key', 'value'])
    .where({ key })
    .first();
};

const saveStoreConfig = async (strapi, id, value) => {
  await strapi.db.connection(CORE_STORE_TABLE)
    .where({ id })
    .update({ value: JSON.stringify(value) });
};

const syncCourseConfig = async (strapi) => {
  const row = await loadStoreConfig(strapi, COURSE_KEY);
  if (!row) return { skipped: true, reason: 'missing-course-config' };

  const current = parseJson(row.value, {});
  const next = {
    ...current,
    layouts: {
      ...(current && current.layouts ? current.layouts : {}),
      edit: normalizeCourseEditLayout(current && current.layouts && current.layouts.edit),
      list: normalizeCourseListLayout(current && current.layouts && current.layouts.list),
    },
    metadatas: {
      ...normalizeCourseMetadatas(current && current.metadatas),
      [COURSE_PRICE_CHANGES_FIELD]: {
        ...(current && current.metadatas && current.metadatas[COURSE_PRICE_CHANGES_FIELD]
          ? current.metadatas[COURSE_PRICE_CHANGES_FIELD]
          : {}),
        edit: {
          ...(current && current.metadatas && current.metadatas[COURSE_PRICE_CHANGES_FIELD]
            && current.metadatas[COURSE_PRICE_CHANGES_FIELD].edit
            ? current.metadatas[COURSE_PRICE_CHANGES_FIELD].edit
            : {}),
          mainField: 'name',
        },
        list: {
          ...(current && current.metadatas && current.metadatas[COURSE_PRICE_CHANGES_FIELD]
            && current.metadatas[COURSE_PRICE_CHANGES_FIELD].list
            ? current.metadatas[COURSE_PRICE_CHANGES_FIELD].list
            : {}),
          mainField: 'name',
        },
      },
    },
  };

  if (JSON.stringify(current) === JSON.stringify(next)) {
    return { skipped: true, reason: 'up-to-date' };
  }

  await saveStoreConfig(strapi, row.id, next);
  return { skipped: false, updatedKey: COURSE_KEY };
};

const syncContentManagerConfig = async (strapi) => {
  const results = await Promise.all([syncCourseConfig(strapi)]);

  return {
    skipped: results.every((item) => item && item.skipped),
    updatedKeys: results.filter((item) => item && !item.skipped).map((item) => item.updatedKey),
  };
};

module.exports = {
  syncContentManagerConfig,
};
