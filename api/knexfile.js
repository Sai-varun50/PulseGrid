const path = require("node:path");
const { loadEnvFile } = require("node:process");

loadEnvFile(path.resolve(__dirname, "../.env"));

module.exports = {
  development: {
    client: "mysql2",

    connection: process.env.DATABASE_URL,

    migrations: {
      directory: "../database/migrations",
    },
  },
};