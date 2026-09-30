/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.up = function (knex) {
  return knex.schema.createTable("api_keys", (table) => {
    table.increments("id").primary();

    table
      .integer("org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");

    table.string("key_hash", 255).notNullable();

    table.text("scopes").notNullable();

    table.dateTime("revoked_at").nullable();

    table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());

    table
      .dateTime("updated_at")
      .notNullable()
      .defaultTo(
        knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
      );

    table.index(["org_id"]);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("api_keys");
};