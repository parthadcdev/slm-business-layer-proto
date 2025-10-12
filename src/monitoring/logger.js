// Comprehensive logging service
const fs = require("fs").promises;
const path = require("path");

class Logger {
  constructor() {
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4,
    };

    this.currentLevel = process.env.LOG_LEVEL || "info";
    this.logDirectory =
      process.env.LOG_DIR || path.join(__dirname, "../../logs");
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxFiles = 10;
    this.logFormat = process.env.LOG_FORMAT || "json";

    this.loggers = {
      security: this.createLogger("security"),
      slm: this.createLogger("slm"),
      business: this.createLogger("business"),
      api: this.createLogger("api"),
      database: this.createLogger("database"),
      system: this.createLogger("system"),
      audit: this.createLogger("audit"),
      performance: this.createLogger("performance"),
    };

    this.sensitiveFields = [
      "password",
      "token",
      "key",
      "secret",
      "auth",
      "credential",
      "ssn",
      "credit_card",
      "cvv",
      "pin",
    ];

    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
      console.log(`Logger initialized: ${this.logDirectory}`);
    } catch (error) {
      console.error("Failed to initialize logger:", error);
    }
  }

  createLogger(category) {
    return {
      error: (message, data = {}) => this.log("error", category, message, data),
      warn: (message, data = {}) => this.log("warn", category, message, data),
      info: (message, data = {}) => this.log("info", category, message, data),
      debug: (message, data = {}) => this.log("debug", category, message, data),
      trace: (message, data = {}) => this.log("trace", category, message, data),
    };
  }

  async log(level, category, message, data = {}) {
    try {
      if (this.logLevels[level] > this.logLevels[this.currentLevel]) {
        return; // Skip logging if level is below current threshold
      }

      const logEntry = this.createLogEntry(level, category, message, data);

      // Write to category-specific file
      await this.writeToFile(category, logEntry);

      // Write to main log file
      await this.writeToFile("main", logEntry);

      // Console output for development
      if (process.env.NODE_ENV !== "production") {
        this.consoleOutput(logEntry);
      }

      // Special handling for critical logs
      if (level === "error") {
        await this.handleErrorLog(logEntry);
      }
    } catch (error) {
      console.error("Logging failed:", error);
    }
  }

  createLogEntry(level, category, message, data = {}) {
    const timestamp = new Date().toISOString();
    const sanitizedData = this.sanitizeData(data);

    const baseEntry = {
      timestamp,
      level: level.toUpperCase(),
      category,
      message,
      pid: process.pid,
      hostname: require("os").hostname(),
      version: process.env.APP_VERSION || "1.0.0",
    };

    // Add data if provided
    if (Object.keys(sanitizedData).length > 0) {
      baseEntry.data = sanitizedData;
    }

    // Add stack trace for errors
    if (level === "error" && data.error) {
      baseEntry.stack = data.error.stack;
    }

    // Add request context if available
    if (data.requestId) {
      baseEntry.requestId = data.requestId;
    }

    if (data.userId) {
      baseEntry.userId = data.userId;
    }

    if (data.sessionId) {
      baseEntry.sessionId = data.sessionId;
    }

    return baseEntry;
  }

  sanitizeData(data) {
    if (!data || typeof data !== "object") {
      return {};
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  isSensitiveField(fieldName) {
    const lowerField = fieldName.toLowerCase();
    return this.sensitiveFields.some((sensitive) =>
      lowerField.includes(sensitive),
    );
  }

  async writeToFile(category, logEntry) {
    try {
      const fileName = `${category}-${this.getDateString()}.log`;
      const filePath = path.join(this.logDirectory, fileName);

      const logLine = this.formatLogEntry(logEntry) + "\n";

      // Check file size and rotate if necessary
      await this.rotateFileIfNeeded(filePath);

      await fs.appendFile(filePath, logLine, "utf8");
    } catch (error) {
      console.error(`Failed to write to log file ${category}:`, error);
    }
  }

  formatLogEntry(entry) {
    if (this.logFormat === "json") {
      return JSON.stringify(entry);
    } else {
      // Plain text format
      const data = entry.data ? ` | ${JSON.stringify(entry.data)}` : "";
      return `${entry.timestamp} [${entry.level}] ${entry.category}: ${entry.message}${data}`;
    }
  }

  async rotateFileIfNeeded(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        await this.rotateFile(filePath);
      }
    } catch (error) {
      // File doesn't exist yet, no rotation needed
    }
  }

  async rotateFile(filePath) {
    try {
      const ext = path.extname(filePath);
      const baseName = filePath.replace(ext, "");

      // Rotate existing files
      for (let i = this.maxFiles - 1; i > 0; i--) {
        const oldFile = `${baseName}.${i}${ext}`;
        const newFile = `${baseName}.${i + 1}${ext}`;

        try {
          await fs.rename(oldFile, newFile);
        } catch (error) {
          // File doesn't exist, continue
        }
      }

      // Move current file to .1
      await fs.rename(filePath, `${baseName}.1${ext}`);

      // Remove old files beyond maxFiles
      try {
        await fs.unlink(`${baseName}.${this.maxFiles + 1}${ext}`);
      } catch (error) {
        // File doesn't exist, ignore
      }
    } catch (error) {
      console.error("File rotation failed:", error);
    }
  }

  consoleOutput(entry) {
    const colorCodes = {
      ERROR: "\x1b[31m", // Red
      WARN: "\x1b[33m", // Yellow
      INFO: "\x1b[36m", // Cyan
      DEBUG: "\x1b[35m", // Magenta
      TRACE: "\x1b[37m", // White
    };

    const resetCode = "\x1b[0m";
    const color = colorCodes[entry.level] || "";

    const output = `${color}${entry.timestamp} [${entry.level}] ${entry.category}: ${entry.message}${resetCode}`;
    console.log(output);

    if (entry.data && Object.keys(entry.data).length > 0) {
      console.log("Data:", JSON.stringify(entry.data, null, 2));
    }
  }

  async handleErrorLog(logEntry) {
    // Send error notifications, alerts, etc.
    try {
      if (logEntry.level === "ERROR") {
        // In production, this might send to monitoring systems
        await this.sendErrorAlert(logEntry);
      }
    } catch (error) {
      console.error("Error handling failed:", error);
    }
  }

  async sendErrorAlert(logEntry) {
    // Placeholder for error alerting
    console.error("CRITICAL ERROR ALERT:", logEntry.message);
  }

  getDateString() {
    const date = new Date();
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  // Specialized logging methods
  async logSLMInteraction(prompt, response, model, context = {}) {
    await this.loggers.slm.info("SLM Interaction", {
      prompt: prompt.substring(0, 500) + (prompt.length > 500 ? "..." : ""),
      response:
        response.substring(0, 500) + (response.length > 500 ? "..." : ""),
      model,
      responseTime: context.responseTime,
      tokenCount: context.tokenCount,
      requestId: context.requestId,
      userId: context.userId,
    });
  }

  async logSecurityEvent(eventType, severity, details = {}) {
    await this.loggers.security[severity](`Security Event: ${eventType}`, {
      eventType,
      severity,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  async logBusinessAction(action, parameters, result, context = {}) {
    await this.loggers.business.info("Business Action Executed", {
      action,
      parameters: this.sanitizeData(parameters),
      success: result.success,
      executionTime: result.executionTime,
      requestId: context.requestId,
      userId: context.userId,
    });
  }

  async logAPICall(service, operation, parameters, response, context = {}) {
    await this.loggers.api.info("API Call", {
      service,
      operation,
      parameters: this.sanitizeData(parameters),
      statusCode: response.statusCode,
      responseTime: response.responseTime,
      requestId: context.requestId,
      userId: context.userId,
    });
  }

  async logDatabaseOperation(
    operation,
    table,
    parameters,
    result,
    context = {},
  ) {
    await this.loggers.database.info("Database Operation", {
      operation,
      table,
      rowCount: result.rowCount,
      executionTime: result.executionTime,
      requestId: context.requestId,
      userId: context.userId,
    });
  }

  async logAuditEvent(eventType, actor, resource, action, result = {}) {
    await this.loggers.audit.info("Audit Event", {
      eventType,
      actor: {
        userId: actor.userId,
        role: actor.role,
        sessionId: actor.sessionId,
      },
      resource,
      action,
      result: {
        success: result.success,
        changes: result.changes,
      },
      timestamp: new Date().toISOString(),
    });
  }

  async logPerformanceMetric(metric, value, context = {}) {
    await this.loggers.performance.info("Performance Metric", {
      metric,
      value,
      unit: context.unit || "ms",
      component: context.component,
      operation: context.operation,
      requestId: context.requestId,
    });
  }

  // Query and analysis methods
  async searchLogs(category, criteria = {}) {
    try {
      const fileName = `${category}-${this.getDateString()}.log`;
      const filePath = path.join(this.logDirectory, fileName);

      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());

      let logs = lines.map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return { raw: line };
        }
      });

      // Apply filters
      if (criteria.level) {
        logs = logs.filter((log) => log.level === criteria.level.toUpperCase());
      }

      if (criteria.startTime) {
        logs = logs.filter(
          (log) => new Date(log.timestamp) >= new Date(criteria.startTime),
        );
      }

      if (criteria.endTime) {
        logs = logs.filter(
          (log) => new Date(log.timestamp) <= new Date(criteria.endTime),
        );
      }

      if (criteria.userId) {
        logs = logs.filter((log) => log.userId === criteria.userId);
      }

      if (criteria.message) {
        logs = logs.filter(
          (log) =>
            log.message &&
            log.message.toLowerCase().includes(criteria.message.toLowerCase()),
        );
      }

      return logs;
    } catch (error) {
      console.error("Log search failed:", error);
      return [];
    }
  }

  async getLogStats(category, timeRange = "24h") {
    try {
      const logs = await this.searchLogs(category, {
        startTime: this.getTimeRangeStart(timeRange),
      });

      const stats = {
        total: logs.length,
        byLevel: {},
        byHour: {},
        errors: logs.filter((log) => log.level === "ERROR").length,
        warnings: logs.filter((log) => log.level === "WARN").length,
      };

      // Count by level
      logs.forEach((log) => {
        stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      });

      // Count by hour
      logs.forEach((log) => {
        const hour = new Date(log.timestamp).getHours();
        stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error("Failed to get log stats:", error);
      return null;
    }
  }

  getTimeRangeStart(range) {
    const now = new Date();
    switch (range) {
      case "1h":
        return new Date(now.getTime() - 60 * 60 * 1000);
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  async cleanup(retentionDays = 30) {
    try {
      const files = await fs.readdir(this.logDirectory);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.logDirectory, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      console.log(`Log cleanup completed: ${deletedCount} files deleted`);
      return { deletedFiles: deletedCount };
    } catch (error) {
      console.error("Log cleanup failed:", error);
      return { error: error.message };
    }
  }

  // Export logs
  async exportLogs(category, startDate, endDate, format = "json") {
    try {
      const logs = await this.searchLogs(category, {
        startTime: startDate,
        endTime: endDate,
      });

      if (format === "csv") {
        return this.convertToCSV(logs);
      }

      return JSON.stringify(logs, null, 2);
    } catch (error) {
      console.error("Log export failed:", error);
      throw error;
    }
  }

  convertToCSV(logs) {
    if (logs.length === 0) return "";

    const headers = [
      "timestamp",
      "level",
      "category",
      "message",
      "userId",
      "requestId",
    ];
    const csvLines = [headers.join(",")];

    logs.forEach((log) => {
      const row = headers.map((header) => {
        const value = log[header] || "";
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvLines.push(row.join(","));
    });

    return csvLines.join("\n");
  }
}

module.exports = new Logger();
