/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.up = async function (knex) {
  await knex.schema.createTable("incident_clusters", (table) => {
    table.increments("id").primary();

    table
      .integer("team_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("teams")
      .onDelete("RESTRICT");

    table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["team_id", "created_at"]);
  });

  await knex.schema.alterTable("incidents", (table) => {
    table
      .integer("cluster_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("incident_clusters")
      .onDelete("SET NULL");

    table.index(["cluster_id"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("incidents", (table) => {
    table.dropForeign(["cluster_id"]);
    table.dropIndex(["cluster_id"]);
    table.dropColumn("cluster_id");
  });

  await knex.schema.dropTableIfExists("incident_clusters");
};