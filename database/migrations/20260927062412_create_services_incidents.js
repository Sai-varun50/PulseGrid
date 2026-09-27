/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.up = function (knex) {
  return knex.schema
    .createTable("services", (table) => {
      table.increments("id").primary();

      table
        .integer("team_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("teams")
        .onDelete("RESTRICT");

      table.string("name", 255).notNullable();

      table.text("description").nullable();

      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());

      table
        .dateTime("updated_at")
        .notNullable()
        .defaultTo(
          knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
        );

      table.index(["team_id"]);
    })
    .createTable("incidents", (table) => {
      table.increments("id").primary();

      table
        .integer("service_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("services")
        .onDelete("RESTRICT");

      table.string("title", 255).notNullable();

      table.text("description").nullable();

      table
        .enu("status", ["triggered", "acknowledged", "resolved"])
        .notNullable()
        .defaultTo("triggered");

      table.string("severity", 50).notNullable();

      table.string("dedup_key", 255).nullable();

      table.integer("current_step").notNullable().defaultTo(0);

      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());

      table
        .dateTime("updated_at")
        .notNullable()
        .defaultTo(
          knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
        );

      table.index(["service_id"]);
      table.index(["status"]);
      table.index(["dedup_key"]);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("incidents")
    .then(() => knex.schema.dropTableIfExists("services"));
};