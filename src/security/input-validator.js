/**
 * SLM Business Service Layer - Comprehensive Input Validation
 *
 * @author Partha Chandramohan
 * @description Advanced input validation and sanitization for AI interactions and user inputs
 */
const securityConfig = require('../config/security-config');
const errorHandler = require('../utils/error-handler');

class InputValidator {
  constructor() {
    try {
      this.aiConfig = securityConfig.get('ai') || {};
      this.validationConfig = securityConfig.get('validation') || {};
    } catch (error) {
      console.warn('Security config not available, using defaults:', error.message);
      this.aiConfig = {};
      this.validationConfig = {};
    }
    this.validationRules = this.loadValidationRules();
    this.sanitizationRules = this.loadSanitizationRules();
  }

  loadValidationRules() {
    return {
      businessRequest: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: this.aiConfig.maxPromptLength || 10000,
        patterns: {
          forbidden: [
            // SQL injection patterns
            /(\b(union|drop|delete|update|insert|create|alter|truncate)\s)/gi,
            // Script injection patterns
            /(<script|<iframe|javascript:|data:text\/html)/gi,
            // Path traversal
            /(\.\.\/|\.\.\\|%2e%2e%2f)/gi,
            // Command injection
            /(\||&&|;|\$\(|\`)/g,
            // Excessive special characters
            /[<>\"']{5,}/g
          ]
        }
      },

      userContext: {
        required: false,
        type: 'object',
        maxProperties: 20,
        allowedProperties: [
          'filters', 'preferences', 'session', 'metadata',
          'timezone', 'locale', 'theme', 'workspace'
        ]
      },

      apiKey: {
        required: false,
        type: 'string',
        minLength: 16,
        maxLength: 256,
        pattern: /^[a-zA-Z0-9\-_\.]+$/
      },

      userId: {
        required: false,
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9\-_@\.]+$/
      },

      email: {
        required: false,
        type: 'string',
        maxLength: 256,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      },

      filename: {
        required: false,
        type: 'string',
        maxLength: 255,
        pattern: /^[a-zA-Z0-9\-_\.\s]+$/,
        allowedExtensions: ['pdf', 'doc', 'docx', 'txt', 'csv', 'json']
      }
    };
  }

  loadSanitizationRules() {
    return {
      removeHtmlTags: /<[^>]*>/g,
      removeScriptTags: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      removeStyleTags: /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
      removeComments: /<!--[\s\S]*?-->/g,
      normalizeWhitespace: /\s+/g,
      removeControlChars: /[\x00-\x1F\x7F]/g,
      removeSqlComments: /(\/\*[\s\S]*?\*\/|--.*$)/gm
    };
  }

  /**
   * Validate business request input
   */
  validateBusinessRequest(request) {
    const result = { valid: true, errors: [], sanitized: request };

    try {
      // Basic validation
      const basicValidation = this.validateBasic(request, this.validationRules.businessRequest);
      if (!basicValidation.valid) {
        return basicValidation;
      }

      // AI-specific validation
      const aiValidation = this.validateAIPrompt(request);
      if (!aiValidation.valid) {
        return aiValidation;
      }

      // Content sanitization
      result.sanitized = this.sanitizeBusinessRequest(request);

      // Security pattern detection
      const securityCheck = this.checkSecurityPatterns(result.sanitized);
      if (!securityCheck.valid) {
        return securityCheck;
      }

      return result;

    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`],
        sanitized: null
      };
    }
  }

  /**
   * Validate user context object
   */
  validateUserContext(context) {
    if (!context) {
      return { valid: true, errors: [], sanitized: {} };
    }

    const result = { valid: true, errors: [], sanitized: context };

    try {
      // Type validation
      if (typeof context !== 'object' || Array.isArray(context)) {
        return {
          valid: false,
          errors: ['Context must be an object'],
          sanitized: null
        };
      }

      // Property count validation
      const propertyCount = Object.keys(context).length;
      if (propertyCount > this.validationRules.userContext.maxProperties) {
        return {
          valid: false,
          errors: [`Too many context properties: ${propertyCount} > ${this.validationRules.userContext.maxProperties}`],
          sanitized: null
        };
      }

      // Validate individual properties
      const sanitizedContext = {};
      for (const [key, value] of Object.entries(context)) {
        // Check if property is allowed
        if (!this.isAllowedContextProperty(key)) {
          result.errors.push(`Disallowed context property: ${key}`);
          continue;
        }

        // Sanitize and validate value
        const sanitizedValue = this.sanitizeContextValue(value);
        if (sanitizedValue !== null) {
          sanitizedContext[key] = sanitizedValue;
        }
      }

      result.sanitized = sanitizedContext;

      if (result.errors.length > 0 && result.errors.length >= Object.keys(context).length) {
        result.valid = false;
      }

      return result;

    } catch (error) {
      return {
        valid: false,
        errors: [`Context validation error: ${error.message}`],
        sanitized: null
      };
    }
  }

  /**
   * Validate file upload
   */
  validateFileUpload(file, content = null) {
    const result = { valid: true, errors: [], sanitized: file };

    try {
      // Validate filename
      const filenameValidation = this.validateBasic(file.filename, this.validationRules.filename);
      if (!filenameValidation.valid) {
        return filenameValidation;
      }

      // Check file extension
      const extension = file.filename.split('.').pop().toLowerCase();
      if (!this.validationRules.filename.allowedExtensions.includes(extension)) {
        return {
          valid: false,
          errors: [`File type not allowed: ${extension}`],
          sanitized: null
        };
      }

      // Check file size
      if (file.size > this.validationConfig.maxFileSize) {
        return {
          valid: false,
          errors: [`File too large: ${file.size} > ${this.validationConfig.maxFileSize}`],
          sanitized: null
        };
      }

      // Validate content if provided
      if (content) {
        const contentValidation = this.validateFileContent(content, extension);
        if (!contentValidation.valid) {
          return contentValidation;
        }
      }

      return result;

    } catch (error) {
      return {
        valid: false,
        errors: [`File validation error: ${error.message}`],
        sanitized: null
      };
    }
  }

  /**
   * Basic validation against rules
   */
  validateBasic(value, rules) {
    const result = { valid: true, errors: [], sanitized: value };

    // Required check
    if (rules.required && (value === null || value === undefined || value === '')) {
      return {
        valid: false,
        errors: ['Value is required'],
        sanitized: null
      };
    }

    // Skip further validation if value is null/undefined and not required
    if (value === null || value === undefined) {
      return result;
    }

    // Type validation
    if (rules.type && typeof value !== rules.type) {
      return {
        valid: false,
        errors: [`Expected type ${rules.type}, got ${typeof value}`],
        sanitized: null
      };
    }

    // String-specific validations
    if (rules.type === 'string' && typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        result.errors.push(`Minimum length ${rules.minLength}, got ${value.length}`);
        result.valid = false;
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        result.errors.push(`Maximum length ${rules.maxLength}, got ${value.length}`);
        result.valid = false;
      }

      if (rules.pattern && !rules.pattern.test(value)) {
        result.errors.push('Value does not match required pattern');
        result.valid = false;
      }

      // Check forbidden patterns
      if (rules.patterns && rules.patterns.forbidden) {
        for (const pattern of rules.patterns.forbidden) {
          if (pattern.test(value)) {
            result.errors.push('Value contains forbidden pattern');
            result.valid = false;
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * AI-specific prompt validation
   */
  validateAIPrompt(prompt) {
    // Use security config's prompt validation if available
    if (securityConfig.get && securityConfig.get('ai').validatePrompt) {
      try {
        const validation = securityConfig.get('ai').validatePrompt(prompt);
        if (!validation.valid) {
          return {
            valid: false,
            errors: [validation.reason || 'AI prompt validation failed'],
            sanitized: null
          };
        }
      } catch (error) {
        console.warn('AI prompt validation failed:', error.message);
      }
    }

    // Additional business-specific validations
    const businessPatterns = [
      // Attempts to manipulate AI behavior
      /ignore\s+(previous|above|all)\s+(instructions?|prompts?|rules?)/gi,
      /forget\s+(everything|all|previous)/gi,
      /you\s+are\s+now\s+a?\s*\w+/gi,
      /pretend\s+(to\s+be|you\s+are)/gi,
      /act\s+like\s+(a\s+)?\w+/gi,

      // Attempts to access system information
      /show\s+me\s+(your\s+)?(instructions?|prompts?|system\s+message)/gi,
      /what\s+(are\s+)?your\s+(instructions?|rules?|guidelines?)/gi,
      /how\s+(were\s+)?you\s+(programmed|trained|configured)/gi,

      // Excessive repetition (potential DoS)
      /(.{1,10})\1{10,}/gi
    ];

    for (const pattern of businessPatterns) {
      if (pattern.test(prompt)) {
        return {
          valid: false,
          errors: ['Prompt contains potentially malicious content'],
          sanitized: null
        };
      }
    }

    return { valid: true, errors: [], sanitized: prompt };
  }

  /**
   * Sanitize business request
   */
  sanitizeBusinessRequest(request) {
    let sanitized = request;

    // Remove HTML tags if HTML sanitization is enabled
    if (this.validationConfig.sanitizeHtml) {
      sanitized = sanitized.replace(this.sanitizationRules.removeHtmlTags, '');
      sanitized = sanitized.replace(this.sanitizationRules.removeScriptTags, '');
      sanitized = sanitized.replace(this.sanitizationRules.removeStyleTags, '');
      sanitized = sanitized.replace(this.sanitizationRules.removeComments, '');
    }

    // Remove control characters
    sanitized = sanitized.replace(this.sanitizationRules.removeControlChars, '');

    // Normalize whitespace
    sanitized = sanitized.replace(this.sanitizationRules.normalizeWhitespace, ' ').trim();

    // Remove SQL comments
    sanitized = sanitized.replace(this.sanitizationRules.removeSqlComments, '');

    return sanitized;
  }

  /**
   * Check for security patterns
   */
  checkSecurityPatterns(input) {
    const securityPatterns = [
      {
        name: 'SQL Injection',
        patterns: [
          /(\b(union|select|insert|update|delete|drop|create|alter)\s+.*\s+(from|into|set|table)\b)/gi,
          /(;\s*drop\s+table)/gi,
          /(\'\s*or\s+\'\d+\'\s*=\s*\'\d+)/gi
        ]
      },
      {
        name: 'XSS',
        patterns: [
          /<script[^>]*>[\s\S]*?<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=\s*["'][^"']*["']/gi
        ]
      },
      {
        name: 'Path Traversal',
        patterns: [
          /(\.\.\/|\.\.\\)/g,
          /%2e%2e%2f/gi,
          /\.\.\%2f/gi
        ]
      },
      {
        name: 'Command Injection',
        patterns: [
          /(\||&&|;|\$\(|\`)/g,
          /\b(ls|cat|ps|whoami|id|pwd|uname)\b/g
        ]
      }
    ];

    for (const category of securityPatterns) {
      for (const pattern of category.patterns) {
        if (pattern.test(input)) {
          return {
            valid: false,
            errors: [`Potential ${category.name} detected`],
            sanitized: null
          };
        }
      }
    }

    return { valid: true, errors: [], sanitized: input };
  }

  /**
   * Check if context property is allowed
   */
  isAllowedContextProperty(property) {
    return this.validationRules.userContext.allowedProperties.includes(property) ||
           /^[a-zA-Z][a-zA-Z0-9_]*$/.test(property); // Allow simple alphanumeric properties
  }

  /**
   * Sanitize context value
   */
  sanitizeContextValue(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      // Limit string length
      if (value.length > 1000) {
        return value.substring(0, 1000);
      }

      // Remove control characters
      return value.replace(this.sanitizationRules.removeControlChars, '');
    }

    if (typeof value === 'number') {
      // Ensure number is finite
      return isFinite(value) ? value : null;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      // Limit array size and sanitize elements
      const sanitizedArray = value.slice(0, 100).map(item => this.sanitizeContextValue(item));
      return sanitizedArray.filter(item => item !== null);
    }

    if (typeof value === 'object') {
      // Recursively sanitize object properties
      const sanitizedObject = {};
      let propertyCount = 0;

      for (const [key, val] of Object.entries(value)) {
        if (propertyCount >= 50) break; // Limit object properties

        const sanitizedKey = key.replace(this.sanitizationRules.removeControlChars, '');
        const sanitizedVal = this.sanitizeContextValue(val);

        if (sanitizedVal !== null) {
          sanitizedObject[sanitizedKey] = sanitizedVal;
          propertyCount++;
        }
      }

      return sanitizedObject;
    }

    // Unknown type, reject
    return null;
  }

  /**
   * Validate file content
   */
  validateFileContent(content, extension) {
    const maxContentLength = 1024 * 1024; // 1MB

    if (content.length > maxContentLength) {
      return {
        valid: false,
        errors: [`File content too large: ${content.length} > ${maxContentLength}`],
        sanitized: null
      };
    }

    // Extension-specific validation
    switch (extension) {
      case 'json':
        try {
          JSON.parse(content);
        } catch (error) {
          return {
            valid: false,
            errors: ['Invalid JSON content'],
            sanitized: null
          };
        }
        break;

      case 'csv':
        // Basic CSV validation
        const lines = content.split('\n');
        if (lines.length > 10000) {
          return {
            valid: false,
            errors: ['CSV file has too many lines'],
            sanitized: null
          };
        }
        break;
    }

    // Check for binary content in text files
    if (['txt', 'csv', 'json'].includes(extension)) {
      const binaryPattern = /[\x00-\x08\x0E-\x1F\x7F]/;
      if (binaryPattern.test(content)) {
        return {
          valid: false,
          errors: ['Text file contains binary content'],
          sanitized: null
        };
      }
    }

    return { valid: true, errors: [], sanitized: content };
  }

  /**
   * Express middleware for input validation
   */
  createValidationMiddleware(validationType = 'businessRequest') {
    return (req, res, next) => {
      try {
        let validationResult;

        switch (validationType) {
          case 'businessRequest':
            validationResult = this.validateBusinessRequest(req.body.request);
            if (validationResult.valid) {
              req.body.request = validationResult.sanitized;
            }
            break;

          case 'userContext':
            validationResult = this.validateUserContext(req.body.context);
            if (validationResult.valid) {
              req.body.context = validationResult.sanitized;
            }
            break;

          default:
            return next(errorHandler.createError(
              'Unknown validation type',
              errorHandler.errorCategories.VALIDATION
            ));
        }

        if (!validationResult.valid) {
          const error = errorHandler.createError(
            validationResult.errors.join('; '),
            errorHandler.errorCategories.VALIDATION,
            errorHandler.severityLevels.MEDIUM,
            { validationType, errors: validationResult.errors }
          );
          return next(error);
        }

        next();

      } catch (error) {
        const validationError = errorHandler.createError(
          'Input validation failed',
          errorHandler.errorCategories.VALIDATION,
          errorHandler.severityLevels.HIGH,
          { originalError: error.message }
        );
        next(validationError);
      }
    };
  }
}

module.exports = new InputValidator();