/**
 * SLM Business Service Layer - Resource Cleanup and Monitoring
 *
 * @author Partha Chandramohan
 * @description Comprehensive resource management, cleanup, and monitoring system
 */
const securityConfig = require('../config/security-config');
const errorHandler = require('./error-handler');

class ResourceMonitor {
  constructor() {
    this.monitoringIntervals = new Map();
    this.resourcePools = new Map();
    this.cleanupTasks = new Map();
    this.metrics = {
      memory: { usage: 0, peak: 0, limit: 0 },
      connections: { active: 0, peak: 0, limit: 0 },
      caches: { size: 0, hitRate: 0, evictions: 0 },
      errors: { total: 0, rate: 0, lastHour: 0 }
    };
    this.isShuttingDown = false;
    this.startTime = Date.now();
  }

  /**
   * Initialize resource monitoring
   */
  initialize() {
    console.log('Initializing resource monitor...');

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Start connection pool monitoring
    this.startConnectionMonitoring();

    // Start cache monitoring
    this.startCacheMonitoring();

    // Start error rate monitoring
    this.startErrorMonitoring();

    // Set up graceful shutdown handlers
    this.setupShutdownHandlers();

    // Register cleanup tasks
    this.registerCleanupTasks();

    console.log('Resource monitor initialized successfully');
  }

  /**
   * Start memory usage monitoring
   */
  startMemoryMonitoring() {
    const memoryCheck = () => {
      const usage = process.memoryUsage();
      const totalMB = Math.round(usage.rss / 1024 / 1024);

      this.metrics.memory.usage = totalMB;
      this.metrics.memory.peak = Math.max(this.metrics.memory.peak, totalMB);

      // Set memory limit if not already set
      if (!this.metrics.memory.limit) {
        this.metrics.memory.limit = securityConfig.get('cache').maxMemoryMB || 500;
      }

      // Check for memory pressure
      const memoryPressure = totalMB / this.metrics.memory.limit;
      if (memoryPressure > 0.8) {
        console.warn(`High memory usage: ${totalMB}MB (${Math.round(memoryPressure * 100)}%)`);
        this.triggerMemoryCleanup();
      }

      if (memoryPressure > 0.95) {
        console.error(`Critical memory usage: ${totalMB}MB - forcing garbage collection`);
        if (global.gc) {
          global.gc();
        }
      }
    };

    this.monitoringIntervals.set('memory', setInterval(memoryCheck, 30000)); // Every 30 seconds
    memoryCheck(); // Initial check
  }

  /**
   * Start connection pool monitoring
   */
  startConnectionMonitoring() {
    const connectionCheck = () => {
      let totalConnections = 0;

      // Check database connections
      try {
        const dbAdapter = require('../database/ai-database-adapter');
        if (dbAdapter.pool) {
          const poolStats = {
            total: dbAdapter.pool.totalCount || 0,
            idle: dbAdapter.pool.idleCount || 0,
            waiting: dbAdapter.pool.waitingCount || 0
          };
          totalConnections += poolStats.total;

          if (poolStats.waiting > 5) {
            console.warn(`Database connection pool under pressure: ${poolStats.waiting} waiting`);
          }
        }
      } catch (error) {
        // Database not available, continue
      }

      this.metrics.connections.active = totalConnections;
      this.metrics.connections.peak = Math.max(this.metrics.connections.peak, totalConnections);
    };

    this.monitoringIntervals.set('connections', setInterval(connectionCheck, 60000)); // Every minute
    connectionCheck(); // Initial check
  }

  /**
   * Start cache monitoring
   */
  startCacheMonitoring() {
    const cacheCheck = () => {
      let totalCacheSize = 0;
      let totalHits = 0;
      let totalRequests = 0;
      let totalEvictions = 0;

      // Check intent classifier cache
      try {
        const intentClassifier = require('../ai/intent-classifier');
        const intentStats = intentClassifier.getCacheStats();
        totalCacheSize += intentStats.size || 0;
        totalHits += intentStats.hits || 0;
        totalRequests += (intentStats.hits || 0) + (intentStats.misses || 0);
        totalEvictions += intentStats.evictions || 0;
      } catch (error) {
        // Service not available
      }

      // Check SQL generator cache
      try {
        const sqlGenerator = require('../ai/sql-generator');
        const sqlStats = sqlGenerator.getCacheStats();
        totalCacheSize += sqlStats.size || 0;
        totalHits += sqlStats.hits || 0;
        totalRequests += (sqlStats.hits || 0) + (sqlStats.misses || 0);
        totalEvictions += sqlStats.evictions || 0;
      } catch (error) {
        // Service not available
      }

      this.metrics.caches.size = totalCacheSize;
      this.metrics.caches.hitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
      this.metrics.caches.evictions = totalEvictions;

      // Alert on low cache hit rates
      if (totalRequests > 100 && this.metrics.caches.hitRate < 50) {
        console.warn(`Low cache hit rate: ${Math.round(this.metrics.caches.hitRate)}%`);
      }
    };

    this.monitoringIntervals.set('caches', setInterval(cacheCheck, 120000)); // Every 2 minutes
    cacheCheck(); // Initial check
  }

  /**
   * Start error rate monitoring
   */
  startErrorMonitoring() {
    const errorCheck = () => {
      try {
        const errorStats = errorHandler.getStats();
        this.metrics.errors.total = errorStats.totalErrors || 0;

        // Calculate error rate (errors per hour)
        const uptimeHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
        this.metrics.errors.rate = uptimeHours > 0 ? this.metrics.errors.total / uptimeHours : 0;

        // Alert on high error rates
        if (this.metrics.errors.rate > 100) {
          console.error(`High error rate: ${Math.round(this.metrics.errors.rate)} errors/hour`);
        }
      } catch (error) {
        // Error handler not available
      }
    };

    this.monitoringIntervals.set('errors', setInterval(errorCheck, 300000)); // Every 5 minutes
    errorCheck(); // Initial check
  }

  /**
   * Trigger memory cleanup when under pressure
   */
  triggerMemoryCleanup() {
    console.log('Triggering memory cleanup due to pressure...');

    // Clear caches
    try {
      const intentClassifier = require('../ai/intent-classifier');
      const sqlGenerator = require('../ai/sql-generator');

      // Get cache stats before cleanup
      const intentStats = intentClassifier.getCacheStats();
      const sqlStats = sqlGenerator.getCacheStats();

      // Clear half of each cache
      if (intentStats.size > 100) {
        intentClassifier.clearCache();
        console.log(`Cleared intent classifier cache (${intentStats.size} entries)`);
      }

      if (sqlStats.size > 50) {
        sqlGenerator.clearCache();
        console.log(`Cleared SQL generator cache (${sqlStats.size} entries)`);
      }
    } catch (error) {
      console.warn('Error during cache cleanup:', error.message);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('Triggered garbage collection');
    }
  }

  /**
   * Register cleanup tasks for graceful shutdown
   */
  registerCleanupTasks() {
    // Database cleanup
    this.cleanupTasks.set('database', async () => {
      try {
        const dbAdapter = require('../database/ai-database-adapter');
        if (dbAdapter.close) {
          await dbAdapter.close();
          console.log('Database connections closed');
        }
      } catch (error) {
        console.error('Error closing database:', error.message);
      }
    });

    // Cache cleanup
    this.cleanupTasks.set('caches', async () => {
      try {
        const intentClassifier = require('../ai/intent-classifier');
        const sqlGenerator = require('../ai/sql-generator');

        if (intentClassifier.clearCache) {
          intentClassifier.clearCache();
        }
        if (sqlGenerator.clearCache) {
          sqlGenerator.clearCache();
        }
        console.log('Caches cleared');
      } catch (error) {
        console.error('Error clearing caches:', error.message);
      }
    });

    // LRU cache cleanup
    this.cleanupTasks.set('lru_caches', async () => {
      try {
        // Find and destroy any LRU cache instances
        const intentClassifier = require('../ai/intent-classifier');
        if (intentClassifier.cache && intentClassifier.cache.destroy) {
          intentClassifier.cache.destroy();
        }

        const sqlGenerator = require('../ai/sql-generator');
        if (sqlGenerator.queryCache && sqlGenerator.queryCache.destroy) {
          sqlGenerator.queryCache.destroy();
        }

        console.log('LRU caches destroyed');
      } catch (error) {
        console.error('Error destroying LRU caches:', error.message);
      }
    });

    // Parallel processor cleanup
    this.cleanupTasks.set('parallel_processor', async () => {
      try {
        const parallelProcessor = require('./parallel-processor');
        if (parallelProcessor.gracefulShutdown) {
          await parallelProcessor.gracefulShutdown();
          console.log('Parallel processor shutdown complete');
        }
      } catch (error) {
        console.error('Error shutting down parallel processor:', error.message);
      }
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) {
        console.log('Shutdown already in progress...');
        return;
      }

      this.isShuttingDown = true;
      console.log(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop monitoring intervals
        for (const [name, interval] of this.monitoringIntervals.entries()) {
          clearInterval(interval);
          console.log(`Stopped ${name} monitoring`);
        }

        // Execute cleanup tasks
        const cleanupPromises = [];
        for (const [name, task] of this.cleanupTasks.entries()) {
          console.log(`Starting cleanup: ${name}`);
          cleanupPromises.push(
            task().catch(error => console.error(`Cleanup failed for ${name}:`, error.message))
          );
        }

        // Wait for all cleanup tasks with timeout
        await Promise.race([
          Promise.all(cleanupPromises),
          new Promise(resolve => setTimeout(resolve, 10000)) // 10 second timeout
        ]);

        console.log('Graceful shutdown complete');
        process.exit(0);

      } catch (error) {
        console.error('Error during graceful shutdown:', error.message);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * Get current resource metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get detailed system health
   */
  async getHealthStatus() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      metrics: this.getMetrics(),
      services: {}
    };

    // Check database health
    try {
      const dbAdapter = require('../database/ai-database-adapter');
      const dbHealth = await dbAdapter.checkHealth();
      health.services.database = dbHealth;
    } catch (error) {
      health.services.database = { healthy: false, error: error.message };
      health.status = 'degraded';
    }

    // Check Ollama health
    try {
      const ollamaClient = require('../slm/ollama-client');
      const ollamaHealth = await ollamaClient.checkHealth();
      health.services.ollama = ollamaHealth;
    } catch (error) {
      health.services.ollama = { healthy: false, error: error.message };
    }

    // Check memory pressure
    const memoryPressure = this.metrics.memory.usage / this.metrics.memory.limit;
    if (memoryPressure > 0.9) {
      health.status = 'critical';
    } else if (memoryPressure > 0.8) {
      health.status = 'degraded';
    }

    // Check error rate
    if (this.metrics.errors.rate > 100) {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Force cleanup of specific resource type
   */
  async forceCleanup(resourceType = 'all') {
    if (resourceType === 'all') {
      for (const [name, task] of this.cleanupTasks.entries()) {
        try {
          await task();
          console.log(`Force cleanup completed: ${name}`);
        } catch (error) {
          console.error(`Force cleanup failed for ${name}:`, error.message);
        }
      }
    } else if (this.cleanupTasks.has(resourceType)) {
      try {
        await this.cleanupTasks.get(resourceType)();
        console.log(`Force cleanup completed: ${resourceType}`);
      } catch (error) {
        console.error(`Force cleanup failed for ${resourceType}:`, error.message);
      }
    } else {
      throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }

  /**
   * Stop monitoring (for testing or manual shutdown)
   */
  stopMonitoring() {
    for (const [name, interval] of this.monitoringIntervals.entries()) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();
    console.log('Resource monitoring stopped');
  }
}

module.exports = new ResourceMonitor();