/**
 * SLM Business Service Layer - Parallel Processing Utilities
 *
 * @author Partha Chandramohan
 * @description Utilities for parallel processing with timeouts, circuit breakers, and error handling
 */
const securityConfig = require("../config/security-config");

class ParallelProcessor {
  constructor() {
    this.circuitBreakers = new Map();
    this.defaultTimeout = 30000; // 30 seconds
  }

  /**
   * Execute multiple async operations in parallel with proper error handling
   */
  async executeParallel(operations, options = {}) {
    const {
      timeout = this.defaultTimeout,
      failFast = false,
      maxConcurrency = 10,
      retryAttempts = 1,
      retryDelay = 1000,
    } = options;

    if (operations.length === 0) {
      return [];
    }

    if (operations.length > maxConcurrency) {
      return this.executeBatched(operations, { ...options, maxConcurrency });
    }

    const promises = operations.map((operation, index) =>
      this.executeWithCircuitBreaker(operation, index, {
        timeout,
        retryAttempts,
        retryDelay,
      }),
    );

    try {
      if (failFast) {
        return await Promise.all(promises);
      } else {
        const results = await Promise.allSettled(promises);
        return this.processSettledResults(results);
      }
    } catch (error) {
      console.error("Parallel execution failed:", error.message);
      throw error;
    }
  }

  /**
   * Execute operations in batches to control concurrency
   */
  async executeBatched(operations, options) {
    const { maxConcurrency } = options;
    const results = [];

    for (let i = 0; i < operations.length; i += maxConcurrency) {
      const batch = operations.slice(i, i + maxConcurrency);
      const batchResults = await this.executeParallel(batch, {
        ...options,
        maxConcurrency: batch.length,
      });
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute single operation with circuit breaker pattern
   */
  async executeWithCircuitBreaker(operation, operationId, options) {
    const { timeout, retryAttempts, retryDelay } = options;
    const circuitBreakerKey = operation.name || `operation_${operationId}`;

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(circuitBreakerKey)) {
      throw new Error(`Circuit breaker open for ${circuitBreakerKey}`);
    }

    let lastError;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(operation, timeout);

        // Reset circuit breaker on success
        this.resetCircuitBreaker(circuitBreakerKey);

        return {
          success: true,
          result,
          operationId,
          attempt,
          executionTime: Date.now(),
        };
      } catch (error) {
        lastError = error;

        // Record failure for circuit breaker
        this.recordFailure(circuitBreakerKey);

        // Retry logic
        if (attempt < retryAttempts) {
          console.warn(
            `Operation ${circuitBreakerKey} failed, retrying in ${retryDelay}ms (attempt ${attempt}/${retryAttempts})`,
          );
          await this.sleep(retryDelay * attempt); // Exponential backoff
        }
      }
    }

    return {
      success: false,
      error: lastError.message,
      operationId,
      attempt: retryAttempts,
      executionTime: Date.now(),
    };
  }

  /**
   * Execute operation with timeout
   */
  async executeWithTimeout(operation, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = await operation();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Process results from Promise.allSettled
   */
  processSettledResults(settledResults) {
    return settledResults.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason?.message || "Unknown error",
          operationId: index,
          executionTime: Date.now(),
        };
      }
    });
  }

  /**
   * Circuit breaker management
   */
  isCircuitBreakerOpen(key) {
    const breaker = this.circuitBreakers.get(key);
    if (!breaker) return false;

    const now = Date.now();

    // If circuit is closed, it's available
    if (breaker.state === "closed") return false;

    // If circuit is open, check if cooldown period has passed
    if (breaker.state === "open") {
      if (now - breaker.lastFailure > breaker.cooldownPeriod) {
        breaker.state = "half-open";
        return false;
      }
      return true;
    }

    // Half-open state - allow limited requests
    return false;
  }

  recordFailure(key) {
    const now = Date.now();
    let breaker = this.circuitBreakers.get(key);

    if (!breaker) {
      breaker = {
        failures: 0,
        lastFailure: now,
        state: "closed",
        cooldownPeriod: 60000, // 1 minute
        failureThreshold: 5,
      };
    }

    breaker.failures++;
    breaker.lastFailure = now;

    // Open circuit if threshold exceeded
    if (breaker.failures >= breaker.failureThreshold) {
      breaker.state = "open";
      console.warn(
        `Circuit breaker opened for ${key} after ${breaker.failures} failures`,
      );
    }

    this.circuitBreakers.set(key, breaker);
  }

  resetCircuitBreaker(key) {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      breaker.failures = 0;
      breaker.state = "closed";
      this.circuitBreakers.set(key, breaker);
    }
  }

  /**
   * Utility for AI service operations
   */
  async executeAIOperations(operations) {
    const aiConfig = securityConfig.get("ai");

    return this.executeParallel(operations, {
      timeout: aiConfig.ollamaTimeout || 30000,
      failFast: false,
      maxConcurrency: 3, // Limit AI operations to prevent overload
      retryAttempts: aiConfig.maxRetries || 2,
      retryDelay: 2000,
    });
  }

  /**
   * Specialized method for database operations
   */
  async executeDatabaseOperations(operations) {
    const dbConfig = securityConfig.get("database");

    return this.executeParallel(operations, {
      timeout: dbConfig.queryTimeout || 30000,
      failFast: true, // Database operations should fail fast
      maxConcurrency: 5,
      retryAttempts: 1,
      retryDelay: 1000,
    });
  }

  /**
   * Execute operations with different priorities
   */
  async executePrioritized(highPriorityOps, lowPriorityOps, options = {}) {
    // Execute high priority operations first
    const highPriorityResults = await this.executeParallel(highPriorityOps, {
      ...options,
      failFast: true,
    });

    // Then execute low priority operations
    const lowPriorityResults = await this.executeParallel(lowPriorityOps, {
      ...options,
      failFast: false,
    });

    return {
      highPriority: highPriorityResults,
      lowPriority: lowPriorityResults,
    };
  }

  /**
   * Rate limited execution
   */
  async executeRateLimited(operations, rateLimit = 5, windowMs = 1000) {
    const results = [];
    let operationIndex = 0;

    while (operationIndex < operations.length) {
      const batch = operations.slice(
        operationIndex,
        operationIndex + rateLimit,
      );
      const batchResults = await this.executeParallel(batch);
      results.push(...batchResults);

      operationIndex += rateLimit;

      if (operationIndex < operations.length) {
        await this.sleep(windowMs);
      }
    }

    return results;
  }

  /**
   * Health check for all services
   */
  async executeHealthChecks(services) {
    const healthCheckOps = services.map((service) => ({
      name: `${service.name}_health_check`,
      operation: () => service.checkHealth(),
    }));

    return this.executeParallel(
      healthCheckOps.map((op) => op.operation),
      {
        timeout: 5000, // Quick health checks
        failFast: false,
        retryAttempts: 1,
      },
    );
  }

  /**
   * Graceful shutdown of all operations
   */
  async gracefulShutdown(ongoingOperations = []) {
    console.log("Initiating graceful shutdown of parallel operations...");

    // Wait for ongoing operations to complete (with timeout)
    if (ongoingOperations.length > 0) {
      try {
        await Promise.race([
          Promise.allSettled(ongoingOperations),
          this.sleep(10000), // 10 second timeout
        ]);
      } catch (error) {
        console.warn(
          "Some operations did not complete during shutdown:",
          error.message,
        );
      }
    }

    // Clear circuit breakers
    this.circuitBreakers.clear();

    console.log("Parallel processor shutdown complete");
  }

  /**
   * Get statistics about operations
   */
  getStats() {
    const circuitBreakerStats = {};

    for (const [key, breaker] of this.circuitBreakers.entries()) {
      circuitBreakerStats[key] = {
        state: breaker.state,
        failures: breaker.failures,
        lastFailure: new Date(breaker.lastFailure).toISOString(),
      };
    }

    return {
      circuitBreakers: circuitBreakerStats,
      totalBreakers: this.circuitBreakers.size,
    };
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new ParallelProcessor();
