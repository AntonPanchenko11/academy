'use strict';

const CORE_STORE_TABLE = 'strapi_core_store_settings';
const COURSE_UID = 'api::course.course';
const COURSE_PRICE_INCREASE_UID = 'api::course-price-increase.course-price-increase';
const COURSE_KEY = `plugin_content_manager_configuration_content_types::${COURSE_UID}`;
const COURSE_PRICE_INCREASE_KEY = `plugin_content_manager_configuration_content_types::${COURSE_PRICE_INCREASE_UID}`;

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

const prependFieldToEditLayout = (rows, fieldName, size = 12) => {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeLayoutRow(row).filter((item) => item.name !== fieldName))
    .filter((row) => row.length);

  return [[{ name: fieldName, size }], ...normalizedRows];
};

const insertFieldIntoListLayout = (fields, fieldName, anchorField = 'id') => {
  const normalizedFields = (Array.isArray(fields) ? fields : []).filter((field) => typeof field === 'string' && field !== fieldName);
  const anchorIndex = normalizedFields.indexOf(anchorField);

  if (anchorIndex === -1) {
    return [fieldName, ...normalizedFields];
  }

  return [
    ...normalizedFields.slice(0, anchorIndex + 1),
    fieldName,
    ...normalizedFields.slice(anchorIndex + 1),
  ];
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

const syncCoursePriceIncreaseConfig = async (strapi) => {
  const row = await loadStoreConfig(strapi, COURSE_PRICE_INCREASE_KEY);
  if (!row) return { skipped: true, reason: 'missing-course-price-increase-config' };

  const current = parseJson(row.value, {});
  const next = {
    ...current,
    settings: {
      ...(current && current.settings ? current.settings : {}),
      mainField: 'name',
      defaultSortBy: 'effectiveAt',
      defaultSortOrder: 'ASC',
    },
    layouts: {
      ...(current && current.layouts ? current.layouts : {}),
      edit: prependFieldToEditLayout(current && current.layouts && current.layouts.edit, 'name', 12),
      list: insertFieldIntoListLayout(current && current.layouts && current.layouts.list, 'name'),
    },
    metadatas: {
      ...(current && current.metadatas ? current.metadatas : {}),
      courses: {
        ...(current && current.metadatas && current.metadatas.courses ? current.metadatas.courses : {}),
        edit: {
          ...(current && current.metadatas && current.metadatas.courses && current.metadatas.courses.edit
            ? current.metadatas.courses.edit
            : {}),
          mainField: 'title',
        },
        list: {
          ...(current && current.metadatas && current.metadatas.courses && current.metadatas.courses.list
            ? current.metadatas.courses.list
            : {}),
          mainField: 'title',
        },
      },
    },
  };

  if (JSON.stringify(current) === JSON.stringify(next)) {
    return { skipped: true, reason: 'up-to-date' };
  }

  await saveStoreConfig(strapi, row.id, next);
  return { skipped: false, updatedKey: COURSE_PRICE_INCREASE_KEY };
};

const syncCourseConfig = async (strapi) => {
  const row = await loadStoreConfig(strapi, COURSE_KEY);
  if (!row) return { skipped: true, reason: 'missing-course-config' };

  const current = parseJson(row.value, {});
  const next = {
    ...current,
    metadatas: {
      ...(current && current.metadatas ? current.metadatas : {}),
      priceIncreases: {
        ...(current && current.metadatas && current.metadatas.priceIncreases ? current.metadatas.priceIncreases : {}),
        edit: {
          ...(current && current.metadatas && current.metadatas.priceIncreases && current.metadatas.priceIncreases.edit
            ? current.metadatas.priceIncreases.edit
            : {}),
          mainField: 'name',
        },
        list: {
          ...(current && current.metadatas && current.metadatas.priceIncreases && current.metadatas.priceIncreases.list
            ? current.metadatas.priceIncreases.list
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
  const results = await Promise.all([
    syncCoursePriceIncreaseConfig(strapi),
    syncCourseConfig(strapi),
  ]);

  return {
    skipped: results.every((item) => item && item.skipped),
    updatedKeys: results.filter((item) => item && !item.skipped).map((item) => item.updatedKey),
  };
};

module.exports = {
  syncContentManagerConfig,
};
