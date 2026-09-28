const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      data: null,
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
      },
    });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      data: null,
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required.",
      },
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET
    );

    req.auth = {
      user_id: payload.user_id,
      org_id: payload.org_id,
      role: payload.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      data: null,
      error: {
        code: "TOKEN_INVALID",
        message: "Invalid or expired access token.",
      },
    });
  }
}

module.exports = {
  authenticate,
};