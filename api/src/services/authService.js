const jwt = require("jsonwebtoken");
const argon2 = require("argon2");
const db = require("../lib/db");


async function hashPassword(password) {
  return argon2.hash(password);
}

async function verifyPassword(password, passwordHash) {
  return argon2.verify(passwordHash, password);
}
function createAccessToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      org_id: user.org_id,
      role: user.role,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: "15m",
    }
  );
}
function createRefreshToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
}
function verifyRefreshToken(token) {
  return jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET
  );
}
async function getUserById(userId) {
  const user = await db("users")
    .select(
      "id",
      "org_id",
      "name",
      "email",
      "role",
      "phone",
      "created_at",
      "updated_at"
    )
    .where({ id: userId })
    .first();

  return user;
}
async function signup({ name, email, password, orgName }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Check whether the email is already registered.
  const existingUser = await db("users")
    .where({ email: normalizedEmail })
    .first();

  if (existingUser) {
    const error = new Error("Email is already registered.");
    error.code = "EMAIL_TAKEN";
    throw error;
  }

  return db.transaction(async (trx) => {
    // Create the organization first.
    const [orgId] = await trx("organizations").insert({
      name: orgName.trim(),
      plan_tier: "free",
    });

    // Hash the password before storing it.
    const passwordHash = await hashPassword(password);

    // Create the first user as the organization admin.
    const [userId] = await trx("users").insert({
      org_id: orgId,
      team_id: null,
      name: name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role: "admin",
      phone: null,
    });

    const user = await trx("users")
      .select(
        "id",
        "org_id",
        "name",
        "email",
        "role",
        "phone",
        "created_at",
        "updated_at"
      )
      .where({ id: userId })
      .first();

    const organization = await trx("organizations")
      .select("id", "name", "plan_tier", "created_at")
      .where({ id: orgId })
      .first();

    return {
      user,
      organization,
    };
  });
}
async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await db("users")
    .where({ email: normalizedEmail })
    .first();

  // Use the same error for unknown email and wrong password.
  if (!user) {
    const error = new Error("Invalid email or password.");
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }

  const passwordValid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!passwordValid) {
    const error = new Error("Invalid email or password.");
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }

  const accessToken = createAccessToken(user);

  const safeUser = {
    id: user.id,
    org_id: user.org_id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };

  const organization = await db("organizations")
    .select("id", "name", "plan_tier", "created_at")
    .where({ id: user.org_id })
    .first();

  return {
    user: safeUser,
    organization,
    accessToken,
  };
}

       module.exports = {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  getUserById,
  signup,
  login,
};