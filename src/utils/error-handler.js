/**
 * SLM Business Service Layer - Structured Error Handling System
 *
 * @author Partha Chandramohan
 * @description Comprehensive error classification, handling, and recovery with security considerations
 */
const securityConfig = require("../config/security-config");

class ErrorHandler {
  constructor() {
    this.errorCategories = {
      SECURITY: "security",
      VALIDATION: "validation",
      DATABASE: "database",
      AI_SERVICE: "ai_service",
      NETWORK: "network",
      AUTHENTICATION: "authentication",
      AUTHORIZATION: "authorization",
      RATE_LIMIT: "rate_limit",
      SYSTEM: "system",
      BUSINESS_LOGIC: "business_logic",
    };

    this.severityLevels = {
      CRITICAL: "critical",
      HIGH: "high",
      MEDIUM: "medium",
      LOW: "low",
      INFO: "info",
    };

    this.errorCounts = new Map();
    this.recentErrors = [];
    this.maxRecentErrors = 100;
  }

  /**
   * Create standardized error object
   */
  createError(message, category, severity = "medium", details = {}) {
    const error = new Error(message);
    error.category = category;
    error.severity = severity;
    error.details = details;
    error.timestamp = new Date().toISOString();
    error.id = this.generateErrorId();

    return error;
  }

  /**
   * Handle and classify errors with appropriate response
   */
  handleError(error, context = {}) {
    const classifiedError = this.classifyError(error);
    const handlingStrategy = this.determineHandlingStrategy(classifiedError);

    // Log the error securely
    this.logError(classifiedError, context);

    // Track error metrics
    this.trackError(classifiedError);

    // Return appropriate response based on strategy
    return this.generateErrorResponse(
      classifiedError,
      handlingStrategy,
      context,
    );
  }

  /**
   * Classify error into appropriate category and severity
   */
  classifyError(error) {
    if (error.category && error.severity) {
      return error; // Already classified
    }

    const message = error.message.toLowerCase();
    let category = this.errorCategories.SYSTEM;
    let severity = this.severityLevels.MEDIUM;

    // Security-related errors
    if (this.isSecurityError(message)) {
      category = this.errorCategories.SECURITY;
      severity = this.severityLevels.CRITICAL;
    }
    // Authentication/Authorization errors
    else if (this.isAuthError(message)) {
      category = this.errorCategories.AUTHENTICATION;
      severity = this.severityLevels.HIGH;
    }
    // Validation errors
    else if (this.isValidationError(message)) {
      category = this.errorCategories.VALIDATION;
      severity = this.severityLevels.MEDIUM;
    }
    // Database errors
    else if (this.isDatabaseError(message)) {
      category = this.errorCategories.DATABASE;
      severity = this.severityLevels.HIGH;
    }
    // AI Service errors
    else if (this.isAIServiceError(message)) {
      category = this.errorCategories.AI_SERVICE;
      severity = this.severityLevels.MEDIUM;
    }
    // Network errors
    else if (this.isNetworkError(message)) {
      category = this.errorCategories.NETWORK;
      severity = this.severityLevels.MEDIUM;
    }
    // Rate limiting
    else if (this.isRateLimitError(message)) {
      category = this.errorCategories.RATE_LIMIT;
      severity = this.severityLevels.LOW;
    }

    return {
      ...error,
      category,
      severity,
      timestamp: new Date().toISOString(),
      id: this.generateErrorId(),
    };
  }

  /**
   * Determine handling strategy based on error classification
   */
  determineHandlingStrategy(error) {
    const strategies = {
      [this.errorCategories.SECURITY]: {
        logLevel: "error",
        includeStack: false,
        includeDetails: false,
        alerting: true,
        userMessage: "A security issue was detected. Please contact support.",
        statusCode: 403,
      },
      [this.errorCategories.AUTHENTICATION]: {
        logLevel: "warn",
        includeStack: false,
        includeDetails: false,
        alerting: false,
        userMessage: "Authentication failed. Please check your credentials.",
        statusCode: 401,
      },
      [this.errorCategories.AUTHORIZATION]: {
        logLevel: "warn",
        includeStack: false,
        includeDetails: false,
        alerting: false,
        userMessage:
          "Access denied. You do not have permission to perform this action.",
        statusCode: 403,
      },
      [this.errorCategories.VALIDATION]: {
        logLevel: "info",
        includeStack: false,
        includeDetails: true,
        alerting: false,
        userMessage: "Invalid input provided. Please check your request.",
        statusCode: 400,
      },
      [this.errorCategories.DATABASE]: {
        logLevel: "error",
        includeStack: true,
        includeDetails: false,
        alerting: true,
        userMessage: "A database error occurred. Please try again later.",
        statusCode: 500,
      },
      [this.errorCategories.AI_SERVICE]: {
        logLevel: "warn",
        includeStack: false,
        includeDetails: false,
        alerting: false,
        userMessage:
          "AI service temporarily unavailable. Using fallback processing.",
        statusCode: 503,
      },
      [this.errorCategories.NETWORK]: {
        logLevel: "warn",
        includeStack: false,
        includeDetails: false,
        alerting: false,
        userMessage: "Network error occurred. Please try again.",
        statusCode: 503,
      },
      [this.errorCategories.RATE_LIMIT]: {
        logLevel: "info",
        includeStack: false,
        includeDetails: true,
        alerting: false,
        userMessage: "Rate limit exceeded. Please slow down your requests.",
        statusCode: 429,
      },
      [this.errorCategories.BUSINESS_LOGIC]: {
        logLevel: "info",
        includeStack: false,
        includeDetails: true,
        alerting: false,
        userMessage: "Business rule validation failed.",
        statusCode: 422,
      },
    };

    return (
      strategies[error.category] || {
        logLevel: "error",
        includeStack: true,
        includeDetails: false,
        alerting: true,
        userMessage: "An unexpected error occurred. Please try again later.",
        statusCode: 500,
      }
    );
  }

  /**
   * Generate appropriate error response for client
   */
  generateErrorResponse(error, strategy, context) {
    const response = {
      success: false,
      error: {
        message: strategy.userMessage,
        id: error.id,
        timestamp: error.timestamp,
        category: error.category,
      },
    };

    // Include additional details for certain error types
    if (strategy.includeDetails && !securityConfig.isProduction()) {
      response.error.details = this.sanitizeErrorDetails(error.details);
    }

    // Include development information in non-production
    if (!securityConfig.isProduction()) {
      response.error.originalMessage = error.message;
      if (strategy.includeStack && error.stack) {
        response.error.stack = error.stack;
      }
    }

    // Add context if relevant
    if (context.requestId) {
      response.error.requestId = context.requestId;
    }

    return {
      response,
      statusCode: strategy.statusCode,
    };
  }

  /**
   * Log error securely with appropriate level
   */
  logError(error, context) {
    const strategy = this.determineHandlingStrategy(error);
    const sanitizedError = this.sanitizeErrorForLogging(error);

    const logEntry = {
      level: strategy.logLevel,
      message: sanitizedError.message,
      category: error.category,
      severity: error.severity,
      id: error.id,
      timestamp: error.timestamp,
      context: this.sanitizeContext(context),
    };

    // Include stack trace for certain error types
    if (strategy.includeStack && error.stack) {
      logEntry.stack = error.stack;
    }

    // Log based on level
    switch (strategy.logLevel) {
      case "error":
        console.error("ERROR:", JSON.stringify(logEntry, null, 2));
        break;
      case "warn":
        console.warn("WARN:", JSON.stringify(logEntry, null, 2));
        break;
      case "info":
        console.info("INFO:", JSON.stringify(logEntry, null, 2));
        break;
      default:
        console.log("LOG:", JSON.stringify(logEntry, null, 2));
    }

    // Alert for critical errors
    if (strategy.alerting) {
      this.sendAlert(error, context);
    }
  }

  /**
   * Error classification helpers
   */
  isSecurityError(message) {
    const securityKeywords = [
      "sql injection",
      "xss",
      "csrf",
      "unauthorized",
      "suspicious",
      "malicious",
      "attack",
      "breach",
      "vulnerability",
      "dangerous sql",
    ];
    return securityKeywords.some((keyword) => message.includes(keyword));
  }

  isAuthError(message) {
    const authKeywords = [
      "authentication",
      "token",
      "invalid token",
      "expired",
      "credentials",
      "unauthorized",
      "forbidden",
      "access denied",
    ];
    return authKeywords.some((keyword) => message.includes(keyword));
  }

  isValidationError(message) {
    const validationKeywords = [
      "validation",
      "invalid",
      "required",
      "missing",
      "format",
      "length",
      "type",
      "range",
      "constraint",
    ];
    return validationKeywords.some((keyword) => message.includes(keyword));
  }

  isDatabaseError(message) {
    const dbKeywords = [
      "database",
      "connection",
      "query",
      "sql",
      "transaction",
      "deadlock",
      "timeout",
      "constraint",
      "table",
      "column",
    ];
    return dbKeywords.some((keyword) => message.includes(keyword));
  }

  isAIServiceError(message) {
    const aiKeywords = [
      "ollama",
      "ai service",
      "model",
      "inference",
      "prompt",
      "generation",
      "classification",
      "intent",
      "llm",
    ];
    return aiKeywords.some((keyword) => message.includes(keyword));
  }

  isNetworkError(message) {
    const networkKeywords = [
      "network",
      "connection",
      "timeout",
      "unreachable",
      "dns",
      "econnrefused",
      "econnreset",
      "etimedout",
    ];
    return networkKeywords.some((keyword) => message.includes(keyword));
  }

  isRateLimitError(message) {
    const rateLimitKeywords = ["rate limit", "too many requests", "throttle"];
    return rateLimitKeywords.some((keyword) => message.includes(keyword));
  }

  /**
   * Track error metrics
   */
  trackError(error) {
    const key = `${error.category}_${error.severity}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);

    // Keep recent errors for analysis
    this.recentErrors.push({
      id: error.id,
      category: error.category,
      severity: error.severity,
      message: error.message,
      timestamp: error.timestamp,
    });

    // Trim recent errors if too many
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }
  }

  /**
   * Sanitize error details for client response
   */
  sanitizeErrorDetails(details) {
    if (!details || typeof details !== "object") {
      return details;
    }

    return securityConfig.sanitizeForLogging(details);
  }

  /**
   * Sanitize error for logging
   */
  sanitizeErrorForLogging(error) {
    return {
      ...error,
      message: securityConfig.sanitizeForLogging
        ? securityConfig.sanitizeForLogging(error.message)
        : error.message,
    };
  }

  /**
   * Sanitize context for logging
   */
  sanitizeContext(context) {
    const sanitized = { ...context };

    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.key;

    return securityConfig.sanitizeForLogging
      ? securityConfig.sanitizeForLogging(sanitized)
      : sanitized;
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `err_${timestamp}_${random}`;
  }

  /**
   * Send alert for critical errors
   */
  sendAlert(error, context) {
    // In a real implementation, this would send alerts to monitoring systems
    console.error(
      `🚨 CRITICAL ERROR ALERT: ${error.category} - ${error.message}`,
    );

    // Could integrate with services like:
    // - Slack/Teams notifications
    // - Email alerts
    // - PagerDuty
    // - Monitoring systems (DataDog, NewRelic, etc.)
  }

  /**
   * Get error statistics
   */
  getStats() {
    const stats = {
      totalErrors: Array.from(this.errorCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      ),
      byCategory: {},
      bySeverity: {},
      recentErrorsCount: this.recentErrors.length,
    };

    // Calculate category and severity distributions
    for (const [key, count] of this.errorCounts.entries()) {
      const [category, severity] = key.split("_");

      stats.byCategory[category] = (stats.byCategory[category] || 0) + count;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + count;
    }

    return stats;
  }

  /**
   * Clear error tracking data
   */
  clearStats() {
    this.errorCounts.clear();
    this.recentErrors.length = 0;
  }

  /**
   * Express.js middleware for error handling
   */
  expressErrorHandler() {
    return (err, req, res, next) => {
      const context = {
        requestId: req.id || req.headers["x-request-id"],
        method: req.method,
        url: req.url,
        userAgent: req.headers["user-agent"],
        userId: req.user?.id,
      };

      const { response, statusCode } = this.handleError(err, context);
      res.status(statusCode).json(response);
    };
  }

  /**
   * Async wrapper for route handlers
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

module.exports = new ErrorHandler();
