// Performance and security metrics collection
const EventEmitter = require("events");

class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
    this.timers = new Map();

    this.config = {
      flushInterval: 60000, // 1 minute
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      maxMetrics: 10000,
    };

    this.alerts = {
      thresholds: {
        slm_response_time: 5000, // 5 seconds
        error_rate: 0.05, // 5%
        memory_usage: 0.8, // 80%
        cpu_usage: 0.8, // 80%
        security_events: 10, // per minute
      },
      callbacks: new Map(),
    };

    this.startCollection();
  }

  startCollection() {
    // Collect system metrics
    this.collectSystemMetrics();

    // Start flush interval
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, this.config.flushInterval);

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.retentionPeriod);

    console.log("Metrics collection started");
  }

  // Counter methods
  incrementCounter(name, value = 1, tags = {}) {
    const key = this.createMetricKey(name, tags);
    const current = this.counters.get(key) || {
      value: 0,
      tags,
      lastUpdated: Date.now(),
    };
    current.value += value;
    current.lastUpdated = Date.now();
    this.counters.set(key, current);

    this.emit("counter", { name, value: current.value, tags });
    this.checkAlerts(name, current.value);
  }

  decrementCounter(name, value = 1, tags = {}) {
    this.incrementCounter(name, -value, tags);
  }

  getCounter(name, tags = {}) {
    const key = this.createMetricKey(name, tags);
    return this.counters.get(key)?.value || 0;
  }

  // Gauge methods
  setGauge(name, value, tags = {}) {
    const key = this.createMetricKey(name, tags);
    this.gauges.set(key, {
      value,
      tags,
      timestamp: Date.now(),
    });

    this.emit("gauge", { name, value, tags });
    this.checkAlerts(name, value);
  }

  getGauge(name, tags = {}) {
    const key = this.createMetricKey(name, tags);
    return this.gauges.get(key)?.value;
  }

  // Histogram methods
  recordHistogram(name, value, tags = {}) {
    const key = this.createMetricKey(name, tags);
    let histogram = this.histograms.get(key);

    if (!histogram) {
      histogram = {
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        tags,
        lastUpdated: Date.now(),
      };
    }

    histogram.values.push(value);
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
    histogram.lastUpdated = Date.now();

    // Keep only recent values for percentile calculations
    if (histogram.values.length > 1000) {
      histogram.values = histogram.values.slice(-1000);
    }

    this.histograms.set(key, histogram);
    this.emit("histogram", { name, value, tags });
    this.checkAlerts(name, value);
  }

  getHistogramStats(name, tags = {}) {
    const key = this.createMetricKey(name, tags);
    const histogram = this.histograms.get(key);

    if (!histogram || histogram.count === 0) {
      return null;
    }

    const sortedValues = [...histogram.values].sort((a, b) => a - b);

    return {
      count: histogram.count,
      sum: histogram.sum,
      avg: histogram.sum / histogram.count,
      min: histogram.min,
      max: histogram.max,
      p50: this.percentile(sortedValues, 0.5),
      p90: this.percentile(sortedValues, 0.9),
      p95: this.percentile(sortedValues, 0.95),
      p99: this.percentile(sortedValues, 0.99),
    };
  }

  // Timer methods
  startTimer(name, tags = {}) {
    const timerId = this.generateTimerId();
    this.timers.set(timerId, {
      name,
      tags,
      startTime: Date.now(),
    });
    return timerId;
  }

  stopTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      return null;
    }

    const duration = Date.now() - timer.startTime;
    this.recordHistogram(timer.name, duration, timer.tags);
    this.timers.delete(timerId);

    return duration;
  }

  timeFunction(name, fn, tags = {}) {
    return async (...args) => {
      const timerId = this.startTimer(name, tags);
      try {
        const result = await fn(...args);
        this.stopTimer(timerId);
        return result;
      } catch (error) {
        this.stopTimer(timerId);
        this.incrementCounter(`${name}_errors`, 1, tags);
        throw error;
      }
    };
  }

  // Business metrics
  recordSLMInteraction(model, responseTime, tokenCount, success = true) {
    const tags = { model, success: success.toString() };

    this.incrementCounter("slm_requests_total", 1, tags);
    this.recordHistogram("slm_response_time", responseTime, tags);
    this.recordHistogram("slm_token_count", tokenCount, tags);

    if (!success) {
      this.incrementCounter("slm_errors_total", 1, tags);
    }

    this.setGauge("slm_last_response_time", responseTime, { model });
  }

  recordBusinessAction(actionType, executionTime, success = true) {
    const tags = { actionType, success: success.toString() };

    this.incrementCounter("business_actions_total", 1, tags);
    this.recordHistogram("business_action_duration", executionTime, tags);

    if (!success) {
      this.incrementCounter("business_action_errors", 1, tags);
    }
  }

  recordAPICall(service, operation, responseTime, statusCode) {
    const tags = {
      service,
      operation,
      status_code: statusCode.toString(),
      success: (statusCode < 400).toString(),
    };

    this.incrementCounter("api_requests_total", 1, tags);
    this.recordHistogram("api_response_time", responseTime, tags);

    if (statusCode >= 400) {
      this.incrementCounter("api_errors_total", 1, tags);
    }
  }

  recordDatabaseOperation(
    operation,
    table,
    executionTime,
    rowCount,
    success = true,
  ) {
    const tags = { operation, table, success: success.toString() };

    this.incrementCounter("db_operations_total", 1, tags);
    this.recordHistogram("db_execution_time", executionTime, tags);
    this.recordHistogram("db_rows_affected", rowCount, tags);

    if (!success) {
      this.incrementCounter("db_errors_total", 1, tags);
    }
  }

  recordSecurityEvent(eventType, severity) {
    const tags = { eventType, severity };

    this.incrementCounter("security_events_total", 1, tags);
    this.incrementCounter(`security_${severity}_events`, 1, { eventType });

    // Security events are always important for alerting
    this.emit("security_event", { eventType, severity, timestamp: Date.now() });
  }

  recordUserAction(action, userId, success = true) {
    const tags = { action, success: success.toString() };

    this.incrementCounter("user_actions_total", 1, tags);
    this.setGauge("last_user_activity", Date.now(), { userId });

    if (!success) {
      this.incrementCounter("user_action_failures", 1, tags);
    }
  }

  // System metrics
  collectSystemMetrics() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Memory metrics
      this.setGauge("memory_rss", memUsage.rss);
      this.setGauge("memory_heap_used", memUsage.heapUsed);
      this.setGauge("memory_heap_total", memUsage.heapTotal);
      this.setGauge("memory_external", memUsage.external);

      // CPU metrics (approximation)
      this.setGauge("cpu_user", cpuUsage.user);
      this.setGauge("cpu_system", cpuUsage.system);

      // Event loop lag
      const start = process.hrtime();
      setImmediate(() => {
        const lag = process.hrtime(start);
        const lagMs = lag[0] * 1000 + lag[1] * 1e-6;
        this.setGauge("event_loop_lag", lagMs);
      });

      // Active handles and requests
      this.setGauge("active_handles", process._getActiveHandles().length);
      this.setGauge("active_requests", process._getActiveRequests().length);
    }, 5000); // Every 5 seconds
  }

  // Alert system
  setAlert(metricName, threshold, callback) {
    this.alerts.thresholds[metricName] = threshold;
    this.alerts.callbacks.set(metricName, callback);
  }

  checkAlerts(metricName, value) {
    const threshold = this.alerts.thresholds[metricName];
    const callback = this.alerts.callbacks.get(metricName);

    if (threshold !== undefined && value > threshold) {
      const alert = {
        metric: metricName,
        value,
        threshold,
        timestamp: Date.now(),
        severity: this.getAlertSeverity(metricName, value, threshold),
      };

      this.emit("alert", alert);

      if (callback) {
        callback(alert);
      }

      // Log alert
      console.warn(
        `ALERT: ${metricName} = ${value} exceeds threshold ${threshold}`,
      );
    }
  }

  getAlertSeverity(metricName, value, threshold) {
    const ratio = value / threshold;

    if (ratio > 2) return "critical";
    if (ratio > 1.5) return "high";
    if (ratio > 1.2) return "medium";
    return "low";
  }

  // Rate calculations
  calculateRate(counterName, timeWindow = 60000, tags = {}) {
    const key = this.createMetricKey(counterName, tags);
    const counter = this.counters.get(key);

    if (!counter) return 0;

    const now = Date.now();
    const windowStart = now - timeWindow;

    // This is simplified - in production, you'd track historical values
    return counter.value / (timeWindow / 1000); // per second
  }

  calculateErrorRate(totalCounterName, errorCounterName, tags = {}) {
    const total = this.getCounter(totalCounterName, tags);
    const errors = this.getCounter(errorCounterName, tags);

    return total > 0 ? errors / total : 0;
  }

  // Data export and reporting
  getMetricsSummary() {
    const summary = {
      timestamp: Date.now(),
      counters: this.summarizeCounters(),
      gauges: this.summarizeGauges(),
      histograms: this.summarizeHistograms(),
      systemHealth: this.getSystemHealth(),
    };

    return summary;
  }

  summarizeCounters() {
    const summary = {};
    for (const [key, counter] of this.counters) {
      summary[key] = {
        value: counter.value,
        tags: counter.tags,
        lastUpdated: counter.lastUpdated,
      };
    }
    return summary;
  }

  summarizeGauges() {
    const summary = {};
    for (const [key, gauge] of this.gauges) {
      summary[key] = {
        value: gauge.value,
        tags: gauge.tags,
        timestamp: gauge.timestamp,
      };
    }
    return summary;
  }

  summarizeHistograms() {
    const summary = {};
    for (const [key, histogram] of this.histograms) {
      summary[key] = this.getHistogramStats(key.split("|")[0], histogram.tags);
    }
    return summary;
  }

  getSystemHealth() {
    return {
      memoryUsage: this.getGauge("memory_heap_used"),
      eventLoopLag: this.getGauge("event_loop_lag"),
      activeHandles: this.getGauge("active_handles"),
      uptime: process.uptime(),
      nodeVersion: process.version,
    };
  }

  // Utility methods
  createMetricKey(name, tags) {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");

    return tagString ? `${name}|${tagString}` : name;
  }

  generateTimerId() {
    return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  percentile(sortedArray, p) {
    if (sortedArray.length === 0) return 0;

    const index = (sortedArray.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedArray[lower];
    }

    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  flushMetrics() {
    const summary = this.getMetricsSummary();
    this.emit("flush", summary);

    // In production, this would send to monitoring systems
    console.debug("Metrics flushed:", Object.keys(summary));
  }

  cleanup() {
    const cutoff = Date.now() - this.config.retentionPeriod;
    let cleaned = 0;

    // Clean old counters
    for (const [key, counter] of this.counters) {
      if (counter.lastUpdated < cutoff) {
        this.counters.delete(key);
        cleaned++;
      }
    }

    // Clean old gauges
    for (const [key, gauge] of this.gauges) {
      if (gauge.timestamp < cutoff) {
        this.gauges.delete(key);
        cleaned++;
      }
    }

    // Clean old histograms
    for (const [key, histogram] of this.histograms) {
      if (histogram.lastUpdated < cutoff) {
        this.histograms.delete(key);
        cleaned++;
      }
    }

    // Clean old timers
    for (const [key, timer] of this.timers) {
      if (timer.startTime < cutoff) {
        this.timers.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.debug(`Cleaned ${cleaned} old metrics`);
    }
  }

  // Export methods
  exportMetrics(format = "json") {
    const summary = this.getMetricsSummary();

    if (format === "prometheus") {
      return this.toPrometheusFormat(summary);
    }

    return JSON.stringify(summary, null, 2);
  }

  toPrometheusFormat(summary) {
    let output = "";

    // Export counters
    for (const [key, counter] of Object.entries(summary.counters)) {
      const [name] = key.split("|");
      output += `# TYPE ${name} counter\n`;
      output += `${name}{${this.formatTags(counter.tags)}} ${counter.value}\n`;
    }

    // Export gauges
    for (const [key, gauge] of Object.entries(summary.gauges)) {
      const [name] = key.split("|");
      output += `# TYPE ${name} gauge\n`;
      output += `${name}{${this.formatTags(gauge.tags)}} ${gauge.value}\n`;
    }

    return output;
  }

  formatTags(tags) {
    return Object.entries(tags)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
  }

  stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    console.log("Metrics collection stopped");
  }
}

module.exports = new MetricsCollector();
