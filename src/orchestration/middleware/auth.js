// Authentication middleware
const jwt = require("jsonwebtoken");
const securityConfig = require("../../config/security-config");

const authMiddleware = (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const jwtConfig = securityConfig.get("jwt");
    const decoded = jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm],
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      clockTolerance: jwtConfig.clockTolerance || 30,
    });

    req.user = decoded;

    // Log authentication event with sanitized data
    const auditConfig = securityConfig.get("audit");
    if (auditConfig.enabled) {
      console.log(
        `Authenticated request from user: ${decoded.id} (${decoded.role})`,
      );
    }

    next();
  } catch (error) {
    console.error(
      "Authentication error:",
      securityConfig.sanitizeForLogging
        ? securityConfig.sanitizeForLogging(error.message)
        : error.message,
    );

    let errorMessage = "Invalid token";
    if (error.name === "TokenExpiredError") {
      errorMessage = "Token expired";
    } else if (error.name === "JsonWebTokenError") {
      errorMessage = "Invalid token format";
    }

    return res.status(401).json({
      success: false,
      error: errorMessage,
    });
  }
};

module.exports = authMiddleware;
