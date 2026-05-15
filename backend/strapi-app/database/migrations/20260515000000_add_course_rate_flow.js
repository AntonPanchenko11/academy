'use strict';

const COURSE_TABLE = 'courses';
const COURSE_TEXT_COLUMNS = ['rate', 'flow'];

const addColumnIfMissing = async (knex, tableName, columnName) => {
  const hasTable = await knex.schema.hasTable(tableName);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(tableName, columnName);
  if (hasColumn) return;

  await knex.schema.alterTable(tableName, (table) => {
    table.string(columnName, 255).nullable();
  });
};

module.exports = {
  async up(knex) {
    for (const columnName of COURSE_TEXT_COLUMNS) {
      await addColumnIfMissing(knex, COURSE_TABLE, columnName);
    }
  },

  async down() {
    // Intentionally preserve columns and data on rollback.
  },
};
