// Input validation middleware
const validator = require('validator');
const xss = require('xss');

const validationMiddleware = (req, res, next) => {
  try {
    // Validate and sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Validate specific endpoints
    if (req.path === '/business-request') {
      if (!validateBusinessRequest(req.body)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request format'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(400).json({
      success: false,
      error: 'Request validation failed'
    });
  }
};

function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return xss(validator.escape(obj));
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

function validateBusinessRequest(body) {
  if (!body || typeof body !== 'object') {
    return false;
  }

  // Check required fields
  if (!body.request || typeof body.request !== 'string') {
    return false;
  }

  // Validate request length
  if (body.request.length > 10000) {
    return false;
  }

  // Validate context if provided
  if (body.context && typeof body.context !== 'object') {
    return false;
  }

  return true;
}

module.exports = validationMiddleware;