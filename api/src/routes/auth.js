const express = require("express");
const { z } = require("zod");
const {
  signup,
  login,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  getUserById,
} = require("../services/authService");

const router = express.Router();

const signupSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8),
  org_name: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setRefreshCookie(res, refreshToken) {
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post("/signup", async (req, res) => {
  const validation = signupSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data.",
      },
    });
  }

  try {
    const result = await signup({
      name: validation.data.name,
      email: validation.data.email,
      password: validation.data.password,
      orgName: validation.data.org_name,
    });

    const accessToken = createAccessToken(result.user);
    const refreshToken = createRefreshToken(result.user);

    setRefreshCookie(res, refreshToken);

    return res.status(201).json({
      data: {
        user: result.user,
        org: result.organization,
        access_token: accessToken,
      },
      error: null,
    });
  } catch (error) {
    if (error.code === "EMAIL_TAKEN") {
      return res.status(409).json({
        data: null,
        error: {
          code: "EMAIL_TAKEN",
          message: error.message,
        },
      });
    }

    console.error(error);

    return res.status(500).json({
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    });
  }
});

router.post("/login", async (req, res) => {
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data.",
      },
    });
  }

  try {
    const result = await login({
      email: validation.data.email,
      password: validation.data.password,
    });

    const refreshToken = createRefreshToken(result.user);

    setRefreshCookie(res, refreshToken);

    return res.status(200).json({
      data: {
        user: result.user,
        org: result.organization,
        access_token: result.accessToken,
      },
      error: null,
    });
  } catch (error) {
    if (error.code === "INVALID_CREDENTIALS") {
      return res.status(401).json({
        data: null,
        error: {
          code: "INVALID_CREDENTIALS",
          message: error.message,
        },
      });
    }

    console.error(error);

    return res.status(500).json({
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    });
  }
});
router.post("/refresh", async (req, res) => {
    
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({
      data: null,
      error: {
        code: "REFRESH_INVALID",
        message: "Invalid or expired refresh token.",
      },
    });
  }

  try {
   const payload = verifyRefreshToken(refreshToken);



const user = await getUserById(payload.user_id);



    if (!user) {
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
      });

      return res.status(401).json({
        data: null,
        error: {
          code: "REFRESH_INVALID",
          message: "Invalid or expired refresh token.",
        },
      });
    }

    const accessToken = createAccessToken(user);
    const newRefreshToken = createRefreshToken(user);

    setRefreshCookie(res, newRefreshToken);

    return res.status(200).json({
      data: {
        access_token: accessToken,
      },
      error: null,
    });
  } catch (error) {
  console.error(
    "Refresh failed:",
    error.name,
    error.message
  );

  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });

  return res.status(401).json({
    data: null,
    error: {
      code: "REFRESH_INVALID",
      message: "Invalid or expired refresh token.",
    },
  });
}
  }
);
module.exports = router;