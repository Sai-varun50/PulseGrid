/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.up = function (knex) {
  return knex.schema.alterTable("incidents", (table) => {
    table.specificType(
      "active_dedup_key",
      "VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN status IN ('triggered', 'acknowledged') THEN dedup_key ELSE NULL END) STORED"
    );

    table.unique(
      ["service_id", "active_dedup_key"],
      "uq_incidents_active_dedup"
    );
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("incidents", (table) => {
    table.dropUnique(
      ["service_id", "active_dedup_key"],
      "uq_incidents_active_dedup"
    );

    table.dropColumn("active_dedup_key");
  });
};