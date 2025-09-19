// Enhanced input validation middleware using comprehensive security validator
const inputValidator = require('../../security/input-validator');
const errorHandler = require('../../utils/error-handler');

const validationMiddleware = (req, res, next) => {
  try {
    // Validate business request
    if (req.body.request) {
      const requestValidation = inputValidator.validateBusinessRequest(req.body.request);
      if (!requestValidation.valid) {
        const error = errorHandler.createError(
          `Request validation failed: ${requestValidation.errors.join('; ')}`,
          errorHandler.errorCategories.VALIDATION,
          errorHandler.severityLevels.MEDIUM,
          { validationErrors: requestValidation.errors }
        );
        const { response, statusCode } = errorHandler.handleError(error);
        return res.status(statusCode).json(response);
      }
      req.body.request = requestValidation.sanitized;
    }

    // Validate user context
    if (req.body.context !== undefined) {
      const contextValidation = inputValidator.validateUserContext(req.body.context);
      if (!contextValidation.valid) {
        const error = errorHandler.createError(
          `Context validation failed: ${contextValidation.errors.join('; ')}`,
          errorHandler.errorCategories.VALIDATION,
          errorHandler.severityLevels.MEDIUM,
          { validationErrors: contextValidation.errors }
        );
        const { response, statusCode } = errorHandler.handleError(error);
        return res.status(statusCode).json(response);
      }
      req.body.context = contextValidation.sanitized;
    }

    next();
  } catch (error) {
    console.error('Validation middleware error:', error);
    const validationError = errorHandler.createError(
      'Request validation failed',
      errorHandler.errorCategories.VALIDATION,
      errorHandler.severityLevels.HIGH,
      { originalError: error.message }
    );
    const { response, statusCode } = errorHandler.handleError(validationError);
    return res.status(statusCode).json(response);
  }
};

module.exports = validationMiddleware;