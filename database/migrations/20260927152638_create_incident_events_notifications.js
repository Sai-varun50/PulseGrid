/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.up = function (knex) {
  return knex.schema
    .createTable("incident_events", (table) => {
      table.increments("id").primary();

      table
        .integer("incident_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("incidents")
        .onDelete("RESTRICT");

      table
        .enu("type", [
          "triggered",
          "acknowledged",
          "escalated",
          "resolved",
          "note",
          "dedup_merged",
        ])
        .notNullable();

      table
        .integer("actor_id")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("RESTRICT");

      table.text("note").nullable();

      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());

      table.index(["incident_id", "created_at"]);
    })
    .createTable("notifications", (table) => {
      table.increments("id").primary();

      table
        .integer("incident_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("incidents")
        .onDelete("RESTRICT");

      table
        .integer("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("RESTRICT");

      table
        .enu("channel", ["push", "sms", "email", "slack_sim"])
        .notNullable();

      table
        .enu("status", ["queued", "sent", "delivered", "failed"])
        .notNullable()
        .defaultTo("queued");

      table.integer("attempt_count").notNullable().defaultTo(0);

      table.dateTime("sent_at").nullable();

      table.index(["incident_id"]);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("notifications")
    .then(() => knex.schema.dropTableIfExists("incident_events"));
};