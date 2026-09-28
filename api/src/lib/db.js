const knexConfig = require("../../knexfile");

const environment = process.env.NODE_ENV || "development";

const db = require("knex")(knexConfig[environment]);

module.exports = db;