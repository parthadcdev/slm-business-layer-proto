/**
 * SLM Business Service Layer - Security Configuration Manager
 *
 * @author Partha Chandramohan
 * @description Centralized security configuration with validation and best practices
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class SecurityConfig {
  constructor() {
    this.config = this.loadSecurityConfig();
    this.validateConfiguration();
  }

  loadSecurityConfig() {
    const config = {
      // JWT Configuration
      jwt: {
        secret: this.getJWTSecret(),
        expiresIn: process.env.JWT_EXPIRES_IN || "24h",
        algorithm: process.env.JWT_ALGORITHM || "HS256",
        issuer: process.env.JWT_ISSUER || "slm-business-layer",
        audience: process.env.JWT_AUDIENCE || "slm-business-api",
      },

      // Database Security
      database: {
        connectionTimeoutMs:
          parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
        queryTimeoutMs: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
        enableSSL: process.env.DB_SSL_ENABLED === "true",
        sslCert: process.env.DB_SSL_CERT_PATH,
        logQueries: process.env.DB_LOG_QUERIES === "true",
        logCredentials: false, // Always false for security
      },

      // Rate Limiting
      rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === "true",
        standardHeaders: true,
        legacyHeaders: false,
      },

      // Input Validation
      validation: {
        maxRequestSize: process.env.MAX_REQUEST_SIZE || "10mb",
        allowedFileTypes: (
          process.env.ALLOWED_FILE_TYPES || "pdf,doc,docx,txt"
        ).split(","),
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
        sanitizeHtml: true,
        validateSqlQueries: true,
      },

      // Encryption
      encryption: {
        algorithm: "aes-256-gcm",
        keyLength: 32,
        ivLength: 16,
        tagLength: 16,
        saltLength: 64,
      },

      // Security Headers
      headers: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // Only for test interface
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        noSniff: true,
        frameGuard: { action: "deny" },
        xssFilter: true,
      },

      // Audit Logging
      audit: {
        enabled: process.env.AUDIT_LOGGING_ENABLED !== "false",
        logLevel: process.env.AUDIT_LOG_LEVEL || "info",
        logFailedAuth: true,
        logSqlQueries: process.env.AUDIT_LOG_SQL === "true",
        logAiInteractions: process.env.AUDIT_LOG_AI === "true",
        sensitiveFields: ["password", "token", "secret", "key", "credential"],
      },

      // AI/LLM Security
      ai: {
        maxPromptLength: parseInt(process.env.AI_MAX_PROMPT_LENGTH) || 8192,
        maxResponseLength:
          parseInt(process.env.AI_MAX_RESPONSE_LENGTH) || 16384,
        timeoutMs: parseInt(process.env.AI_TIMEOUT_MS) || 30000,
        enablePromptFiltering: process.env.AI_PROMPT_FILTERING !== "false",
        bannedPatterns: [
          /(?:ignore|forget|disregard).{0,50}(?:previous|above|earlier)/i,
          /(?:system|admin|root).{0,20}(?:prompt|instruction)/i,
          /(?:sql|database).{0,20}(?:injection|attack)/i,
          /(?:execute|run|eval).{0,20}(?:command|script|code)/i,
        ],
      },
    };

    return config;
  }

  getJWTSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error(
        "JWT_SECRET environment variable is required. " +
          "Please set a strong, randomly generated secret (minimum 32 characters).",
      );
    }

    if (secret.length < 32) {
      throw new Error(
        "JWT_SECRET must be at least 32 characters long for security. " +
          "Current length: " +
          secret.length,
      );
    }

    if (
      secret === "default-secret" ||
      secret === "secret" ||
      secret === "password"
    ) {
      throw new Error(
        "JWT_SECRET cannot be a common default value. " +
          "Please use a cryptographically secure random string.",
      );
    }

    return secret;
  }

  validateConfiguration() {
    // Validate JWT configuration
    if (!this.config.jwt.secret) {
      throw new Error("JWT secret validation failed");
    }

    // Validate database timeouts
    if (this.config.database.connectionTimeoutMs < 1000) {
      throw new Error("Database connection timeout must be at least 1000ms");
    }

    // Validate rate limiting
    if (this.config.rateLimiting.maxRequests < 1) {
      throw new Error("Rate limit max requests must be at least 1");
    }

    // Validate file upload limits
    if (this.config.validation.maxFileSize > 50 * 1024 * 1024) {
      // 50MB
      console.warn(
        "File upload limit is very high (>50MB). Consider reducing for security.",
      );
    }

    console.log("Security configuration validated successfully");
  }

  // Generate secure configuration file template
  generateConfigTemplate() {
    const template = `# SLM Business Service Layer - Security Configuration
# Copy this to .env and update with your secure values

# JWT Configuration - REQUIRED
JWT_SECRET=${this.generateSecureSecret(64)}
JWT_EXPIRES_IN=24h
JWT_ALGORITHM=HS256
JWT_ISSUER=slm-business-layer
JWT_AUDIENCE=slm-business-api

# Database Configuration
DB_CONNECTION_TIMEOUT=5000
DB_QUERY_TIMEOUT=30000
DB_MAX_CONNECTIONS=20
DB_SSL_ENABLED=false
DB_LOG_QUERIES=false

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SKIP_SUCCESS=false

# File Upload Security
MAX_REQUEST_SIZE=10mb
ALLOWED_FILE_TYPES=pdf,doc,docx,txt
MAX_FILE_SIZE=10485760

# Audit Logging
AUDIT_LOGGING_ENABLED=true
AUDIT_LOG_LEVEL=info
AUDIT_LOG_SQL=false
AUDIT_LOG_AI=true

# AI/LLM Security
AI_MAX_PROMPT_LENGTH=8192
AI_MAX_RESPONSE_LENGTH=16384
AI_TIMEOUT_MS=30000
AI_PROMPT_FILTERING=true
`;

    return template;
  }

  generateSecureSecret(length = 64) {
    return crypto.randomBytes(length).toString("base64url");
  }

  // Encrypt sensitive data
  encrypt(text, key = null) {
    if (!key) {
      key = crypto.scryptSync(
        this.config.jwt.secret,
        "salt",
        this.config.encryption.keyLength,
      );
    }

    const iv = crypto.randomBytes(this.config.encryption.ivLength);
    const cipher = crypto.createCipher(
      this.config.encryption.algorithm,
      key,
      iv,
    );

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
    };
  }

  // Decrypt sensitive data
  decrypt(encryptedData, key = null) {
    if (!key) {
      key = crypto.scryptSync(
        this.config.jwt.secret,
        "salt",
        this.config.encryption.keyLength,
      );
    }

    const decipher = crypto.createDecipher(
      this.config.encryption.algorithm,
      key,
      Buffer.from(encryptedData.iv, "hex"),
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, "hex"));

    let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  // Validate AI prompts for security
  validatePrompt(prompt) {
    if (!this.config.ai.enablePromptFiltering) {
      return { valid: true };
    }

    if (prompt.length > this.config.ai.maxPromptLength) {
      return {
        valid: false,
        reason: `Prompt exceeds maximum length of ${this.config.ai.maxPromptLength} characters`,
      };
    }

    for (const pattern of this.config.ai.bannedPatterns) {
      if (pattern.test(prompt)) {
        return {
          valid: false,
          reason: "Prompt contains potentially malicious content",
        };
      }
    }

    return { valid: true };
  }

  // Get configuration for specific component
  get(section) {
    return this.config[section] || {};
  }

  // Get all configuration
  getAll() {
    return { ...this.config };
  }

  // Check if running in development mode
  isDevelopment() {
    return process.env.NODE_ENV === "development";
  }

  // Check if running in production mode
  isProduction() {
    return process.env.NODE_ENV === "production";
  }
}

module.exports = new SecurityConfig();
