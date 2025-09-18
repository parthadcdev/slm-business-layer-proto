/**
 * SLM Business Service Layer - Service URL Configuration
 *
 * @author Partha Chandramohan
 * @description Centralized configuration for all service URLs
 */

const config = {
  // Core Services
  chromadb: {
    baseUrl: process.env.CHROMADB_URL || 'http://localhost:8000',
    apiVersion: 'v2',
    endpoints: {
      version: '/api/v2/version',
      collections: '/api/v1/collections',
      query: '/api/v1/collections/{collection}/query',
      add: '/api/v1/collections/{collection}/add'
    }
  },

  ollama: {
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    endpoints: {
      tags: '/api/tags',
      generate: '/api/generate',
      chat: '/api/chat',
      pull: '/api/pull',
      push: '/api/push',
      embeddings: '/api/embeddings'
    }
  },

  // Business Microservices
  orderService: {
    baseUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:8002',
    endpoints: {
      orders: '/api/orders',
      status: '/api/orders/status',
      create: '/api/orders',
      update: '/api/orders/{id}'
    }
  },

  inventoryService: {
    baseUrl: process.env.INVENTORY_SERVICE_URL || 'http://localhost:8003',
    endpoints: {
      inventory: '/api/inventory',
      stockLevels: '/api/inventory/stock-levels',
      lowStock: '/api/inventory/low-stock',
      update: '/api/inventory/{id}'
    }
  },

  customerService: {
    baseUrl: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:8004',
    endpoints: {
      customers: '/api/customers',
      profile: '/api/customers/{id}',
      search: '/api/customers/search',
      analytics: '/api/customers/analytics'
    }
  },

  productService: {
    baseUrl: process.env.PRODUCT_SERVICE_URL || 'http://localhost:8005',
    endpoints: {
      products: '/api/products',
      catalog: '/api/products/catalog',
      search: '/api/products/search',
      categories: '/api/products/categories'
    }
  },

  // Analytics and Reporting
  analyticsService: {
    baseUrl: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:8006',
    endpoints: {
      reports: '/api/reports',
      metrics: '/api/metrics',
      dashboard: '/api/dashboard'
    }
  },

  // RAG and Embedding Services
  embeddingService: {
    baseUrl: process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8007',
    endpoints: {
      embed: '/api/embed',
      health: '/api/health'
    }
  },

  // Legacy Services (from api-functions.js)
  userService: {
    baseUrl: process.env.USER_SERVICE_URL || 'http://localhost:3001',
    endpoints: {
      users: '/api/users',
      profile: '/api/users/profile'
    }
  },

  orderServiceLegacy: {
    baseUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:3002',
    endpoints: {
      orders: '/api/orders',
      status: '/api/orders/status'
    }
  },

  paymentService: {
    baseUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3003',
    endpoints: {
      payments: '/api/payments',
      process: '/api/payments/process'
    }
  },

  notificationService: {
    baseUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
    endpoints: {
      notifications: '/api/notifications',
      send: '/api/notifications/send'
    }
  }
};

// Utility functions
const urlBuilder = {
  /**
   * Build full URL for a service endpoint
   * @param {string} service - Service name (e.g., 'chromadb', 'ollama')
   * @param {string} endpoint - Endpoint name (e.g., 'version', 'generate')
   * @param {object} params - Parameters to replace in endpoint path
   * @returns {string} Full URL
   */
  build(service, endpoint, params = {}) {
    const serviceConfig = config[service];
    if (!serviceConfig) {
      throw new Error(`Service '${service}' not found in configuration`);
    }

    let endpointPath = serviceConfig.endpoints[endpoint];
    if (!endpointPath) {
      throw new Error(`Endpoint '${endpoint}' not found for service '${service}'`);
    }

    // Replace path parameters
    Object.keys(params).forEach(key => {
      endpointPath = endpointPath.replace(`{${key}}`, params[key]);
    });

    return `${serviceConfig.baseUrl}${endpointPath}`;
  },

  /**
   * Get base URL for a service
   * @param {string} service - Service name
   * @returns {string} Base URL
   */
  getBaseUrl(service) {
    const serviceConfig = config[service];
    if (!serviceConfig) {
      throw new Error(`Service '${service}' not found in configuration`);
    }
    return serviceConfig.baseUrl;
  }
};

module.exports = {
  config,
  urlBuilder
};