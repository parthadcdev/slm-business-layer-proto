// Pre-approved API operations
const axios = require('axios');
const https = require('https');

class APIFunctions {
  constructor() {
    this.allowedDomains = [
      'localhost',
      '127.0.0.1',
      'api.internal.company.com',
      'services.company.com'
    ];

    this.allowedOperations = {
      'user-service': {
        baseUrl: process.env.USER_SERVICE_URL || 'http://localhost:3001',
        operations: ['getUser', 'updateProfile', 'validateUser']
      },
      'order-service': {
        baseUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:3002',
        operations: ['createOrder', 'getOrder', 'updateOrderStatus', 'cancelOrder']
      },
      'payment-service': {
        baseUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003',
        operations: ['processPayment', 'refundPayment', 'getPaymentStatus']
      },
      'notification-service': {
        baseUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
        operations: ['sendEmail', 'sendSMS', 'sendPushNotification']
      }
    };

    this.rateLimits = {
      default: { requests: 100, window: 60000 }, // 100 requests per minute
      'payment-service': { requests: 10, window: 60000 }, // 10 payment requests per minute
      'notification-service': { requests: 50, window: 60000 }
    };

    this.requestCounts = new Map();
  }

  async executeAPICall(service, operation, parameters = {}, context = {}) {
    try {
      // Validate service and operation
      this.validateServiceOperation(service, operation);

      // Check rate limits
      await this.checkRateLimit(service, context);

      // Validate parameters
      const validatedParams = this.validateParameters(service, operation, parameters);

      // Execute the API call
      const result = await this.performAPICall(service, operation, validatedParams, context);

      // Log the operation
      this.logAPICall(service, operation, validatedParams, result, context);

      return {
        success: true,
        service,
        operation,
        data: result.data,
        metadata: {
          statusCode: result.status,
          responseTime: result.responseTime,
          requestId: result.requestId
        }
      };
    } catch (error) {
      console.error(`API call failed: ${service}.${operation}`, error.message);
      throw new Error(`API operation failed: ${error.message}`);
    }
  }

  validateServiceOperation(service, operation) {
    if (!this.allowedOperations[service]) {
      throw new Error(`Service '${service}' is not allowed`);
    }

    if (!this.allowedOperations[service].operations.includes(operation)) {
      throw new Error(`Operation '${operation}' is not allowed for service '${service}'`);
    }
  }

  async checkRateLimit(service, context) {
    const limit = this.rateLimits[service] || this.rateLimits.default;
    const key = `${service}_${context.userId || 'anonymous'}`;
    const now = Date.now();

    if (!this.requestCounts.has(key)) {
      this.requestCounts.set(key, { count: 0, windowStart: now });
    }

    const counter = this.requestCounts.get(key);

    // Reset window if needed
    if (now - counter.windowStart > limit.window) {
      counter.count = 0;
      counter.windowStart = now;
    }

    // Check limit
    if (counter.count >= limit.requests) {
      throw new Error(`Rate limit exceeded for service '${service}'`);
    }

    counter.count++;
  }

  validateParameters(service, operation, parameters) {
    const validationRules = this.getValidationRules(service, operation);
    const validatedParams = {};

    for (const [key, rule] of Object.entries(validationRules)) {
      const value = parameters[key];

      if (rule.required && (value === undefined || value === null)) {
        throw new Error(`Required parameter '${key}' is missing`);
      }

      if (value !== undefined && value !== null) {
        validatedParams[key] = this.validateParameterValue(key, value, rule);
      }
    }

    return validatedParams;
  }

  getValidationRules(service, operation) {
    const rules = {
      'user-service': {
        'getUser': {
          userId: { type: 'string', required: true, pattern: /^[a-zA-Z0-9-]+$/ }
        },
        'updateProfile': {
          userId: { type: 'string', required: true, pattern: /^[a-zA-Z0-9-]+$/ },
          profileData: { type: 'object', required: true }
        },
        'validateUser': {
          email: { type: 'email', required: true },
          password: { type: 'string', required: true, minLength: 8 }
        }
      },
      'order-service': {
        'createOrder': {
          userId: { type: 'string', required: true },
          items: { type: 'array', required: true, minItems: 1 },
          totalAmount: { type: 'number', required: true, min: 0 }
        },
        'getOrder': {
          orderId: { type: 'string', required: true, pattern: /^ORD-[0-9]+$/ }
        },
        'updateOrderStatus': {
          orderId: { type: 'string', required: true, pattern: /^ORD-[0-9]+$/ },
          status: { type: 'string', required: true, enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] }
        },
        'cancelOrder': {
          orderId: { type: 'string', required: true, pattern: /^ORD-[0-9]+$/ },
          reason: { type: 'string', required: false }
        }
      },
      'payment-service': {
        'processPayment': {
          orderId: { type: 'string', required: true },
          amount: { type: 'number', required: true, min: 0.01 },
          paymentMethod: { type: 'string', required: true, enum: ['credit_card', 'debit_card', 'paypal'] }
        },
        'refundPayment': {
          paymentId: { type: 'string', required: true },
          amount: { type: 'number', required: true, min: 0.01 },
          reason: { type: 'string', required: true }
        },
        'getPaymentStatus': {
          paymentId: { type: 'string', required: true }
        }
      },
      'notification-service': {
        'sendEmail': {
          to: { type: 'email', required: true },
          subject: { type: 'string', required: true, maxLength: 200 },
          body: { type: 'string', required: true, maxLength: 10000 },
          templateId: { type: 'string', required: false }
        },
        'sendSMS': {
          to: { type: 'phone', required: true },
          message: { type: 'string', required: true, maxLength: 160 }
        },
        'sendPushNotification': {
          userId: { type: 'string', required: true },
          title: { type: 'string', required: true, maxLength: 100 },
          body: { type: 'string', required: true, maxLength: 500 }
        }
      }
    };

    return rules[service]?.[operation] || {};
  }

  validateParameterValue(key, value, rule) {
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Parameter '${key}' must be a string`);
        }
        if (rule.minLength && value.length < rule.minLength) {
          throw new Error(`Parameter '${key}' must be at least ${rule.minLength} characters`);
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          throw new Error(`Parameter '${key}' must be no more than ${rule.maxLength} characters`);
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          throw new Error(`Parameter '${key}' format is invalid`);
        }
        if (rule.enum && !rule.enum.includes(value)) {
          throw new Error(`Parameter '${key}' must be one of: ${rule.enum.join(', ')}`);
        }
        return value;

      case 'number':
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(num)) {
          throw new Error(`Parameter '${key}' must be a valid number`);
        }
        if (rule.min !== undefined && num < rule.min) {
          throw new Error(`Parameter '${key}' must be at least ${rule.min}`);
        }
        if (rule.max !== undefined && num > rule.max) {
          throw new Error(`Parameter '${key}' must be no more than ${rule.max}`);
        }
        return num;

      case 'email':
        if (typeof value !== 'string') {
          throw new Error(`Parameter '${key}' must be a string`);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new Error(`Parameter '${key}' must be a valid email address`);
        }
        return value;

      case 'phone':
        if (typeof value !== 'string') {
          throw new Error(`Parameter '${key}' must be a string`);
        }
        if (!/^\+?[\d\s\-\(\)]+$/.test(value)) {
          throw new Error(`Parameter '${key}' must be a valid phone number`);
        }
        return value;

      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Parameter '${key}' must be an array`);
        }
        if (rule.minItems && value.length < rule.minItems) {
          throw new Error(`Parameter '${key}' must have at least ${rule.minItems} items`);
        }
        if (rule.maxItems && value.length > rule.maxItems) {
          throw new Error(`Parameter '${key}' must have no more than ${rule.maxItems} items`);
        }
        return value;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          throw new Error(`Parameter '${key}' must be an object`);
        }
        return value;

      default:
        return value;
    }
  }

  async performAPICall(service, operation, parameters, context) {
    const serviceConfig = this.allowedOperations[service];
    const startTime = Date.now();

    // Build request configuration
    const config = {
      method: this.getHTTPMethod(operation),
      url: `${serviceConfig.baseUrl}/api/${operation}`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': this.generateRequestId(),
        'X-User-ID': context.userId || 'system',
        'X-Session-ID': context.sessionId || 'none'
      }
    };

    // Add authentication if available
    if (context.authToken) {
      config.headers['Authorization'] = `Bearer ${context.authToken}`;
    }

    // Add data for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(config.method)) {
      config.data = parameters;
    } else {
      config.params = parameters;
    }

    // Make the request
    const response = await axios(config);

    return {
      data: response.data,
      status: response.status,
      responseTime: Date.now() - startTime,
      requestId: config.headers['X-Request-ID']
    };
  }

  getHTTPMethod(operation) {
    const methodMap = {
      'get': 'GET',
      'create': 'POST',
      'update': 'PUT',
      'delete': 'DELETE',
      'send': 'POST',
      'process': 'POST',
      'validate': 'POST',
      'cancel': 'PATCH',
      'refund': 'POST'
    };

    for (const [verb, method] of Object.entries(methodMap)) {
      if (operation.toLowerCase().startsWith(verb)) {
        return method;
      }
    }

    return 'POST'; // Default
  }

  generateRequestId() {
    return `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  logAPICall(service, operation, parameters, result, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service,
      operation,
      userId: context.userId,
      sessionId: context.sessionId,
      requestId: result.requestId,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      success: true
    };

    console.log('API Call:', JSON.stringify(logEntry));
  }

  async getServiceStatus() {
    const statuses = {};

    for (const [serviceName, config] of Object.entries(this.allowedOperations)) {
      try {
        const response = await axios.get(`${config.baseUrl}/health`, {
          timeout: 5000
        });
        statuses[serviceName] = {
          healthy: response.status === 200,
          responseTime: response.headers['x-response-time'] || 'unknown',
          lastChecked: new Date().toISOString()
        };
      } catch (error) {
        statuses[serviceName] = {
          healthy: false,
          error: error.message,
          lastChecked: new Date().toISOString()
        };
      }
    }

    return statuses;
  }

  getAvailableOperations() {
    const operations = {};

    for (const [serviceName, config] of Object.entries(this.allowedOperations)) {
      operations[serviceName] = {
        baseUrl: config.baseUrl,
        operations: config.operations,
        rateLimit: this.rateLimits[serviceName] || this.rateLimits.default
      };
    }

    return operations;
  }
}

module.exports = new APIFunctions();