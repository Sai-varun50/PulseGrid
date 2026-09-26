exports.up = async function (knex) {
  await knex.schema.createTable("organizations", (table) => {
    table.increments("id").primary();
    table.string("name", 255).notNullable();
    table.string("plan_tier", 50).notNullable().defaultTo("free");
    table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("teams", (table) => {
    table.increments("id").primary();
    table
      .integer("org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("RESTRICT");

    table.string("name", 255).notNullable();
    table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["org_id"]);
  });

  await knex.schema.createTable("users", (table) => {
    table.increments("id").primary();

    table
      .integer("org_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("RESTRICT");

    table
      .integer("team_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("teams")
      .onDelete("SET NULL");

    table.string("name", 255).notNullable();
    table.string("email", 255).notNullable().unique();
    table.string("password_hash", 255).notNullable();

    table
      .enu("role", ["admin", "responder", "viewer"])
      .notNullable();

    table.string("phone", 30).nullable();

    table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
    table
      .dateTime("updated_at")
      .notNullable()
      .defaultTo(knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"));

    table.index(["org_id"]);
    table.index(["email"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("teams");
  await knex.schema.dropTableIfExists("organizations");
};