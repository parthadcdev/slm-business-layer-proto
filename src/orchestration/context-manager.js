/**
 * SLM Business Service Layer - Context Manager
 *
 * @author Partha Chandramohan
 * @description User context and session management for enriching requests with user profile, permissions, and system state
 */
const redis = require("redis");

class ContextManager {
  constructor() {
    this.redisConnected = false;
    this.sessionStore = new Map(); // Initialize in-memory storage
    
    try {
      this.redis = redis.createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
        socket: {
          reconnectStrategy: () => false, // Don't auto-reconnect
        },
      });
      
      // Handle Redis errors gracefully
      this.redis.on('error', (error) => {
        console.warn("[ContextManager] Redis error, using in-memory fallback:", error.message);
        this.redisConnected = false;
      });
      
      this.redis.connect()
        .then(() => {
          this.redisConnected = true;
          console.log("[ContextManager] Redis connected successfully");
        })
        .catch((error) => {
          console.warn("[ContextManager] Redis connection failed, using in-memory fallback:", error.message);
          this.redisConnected = false;
        });
    } catch (error) {
      console.warn("[ContextManager] Failed to initialize Redis client, using in-memory fallback:", error.message);
      this.redis = null;
    }
  }

  async enrichContext(baseContext, user) {
    try {
      const sessionId = baseContext.sessionId || this.generateSessionId();

      // Get existing session data
      const sessionData = await this.getSessionData(sessionId);

      // Build enriched context
      const enrichedContext = {
        ...baseContext,
        sessionId,
        userRole: user?.role || "guest",
        userId: user?.id || null,
        timestamp: new Date().toISOString(),
        requestCount: (sessionData?.requestCount || 0) + 1,
        lastActivity: sessionData?.lastActivity || null,
        userPermissions: user?.permissions || [],
        sessionHistory: sessionData?.history || [],
      };

      // Update session data
      await this.updateSessionData(sessionId, enrichedContext);

      return enrichedContext;
    } catch (error) {
      console.error("Error enriching context:", error);
      throw new Error("Failed to enrich context");
    }
  }

  async getSessionData(sessionId) {
    try {
      if (this.redis && this.redisConnected) {
        const data = await this.redis.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
      } else {
        // Use in-memory fallback
        const data = this.sessionStore?.get(sessionId);
        return data || null;
      }
    } catch (error) {
      console.error("Error getting session data:", error);
      // Fall back to in-memory
      const data = this.sessionStore?.get(sessionId);
      return data || null;
    }
  }

  async updateSessionData(sessionId, context) {
    try {
      const sessionData = {
        requestCount: context.requestCount,
        lastActivity: context.timestamp,
        userRole: context.userRole,
        userId: context.userId,
        history: [
          ...(context.sessionHistory || []).slice(-9), // Keep last 10 entries
          {
            timestamp: context.timestamp,
            requestCount: context.requestCount,
          },
        ],
      };

      if (this.redis && this.redisConnected) {
        await this.redis.setEx(
          `session:${sessionId}`,
          3600 * 24, // 24 hours TTL
          JSON.stringify(sessionData),
        );
      } else {
        // Use in-memory fallback
        if (!this.sessionStore) {
          this.sessionStore = new Map();
        }
        this.sessionStore.set(sessionId, sessionData);
      }
    } catch (error) {
      console.error("Error updating session data:", error);
      // Fall back to in-memory on error
      if (!this.sessionStore) {
        this.sessionStore = new Map();
      }
      this.sessionStore.set(sessionId, sessionData);
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async clearSession(sessionId) {
    try {
      await this.redis.del(`session:${sessionId}`);
    } catch (error) {
      console.error("Error clearing session:", error);
    }
  }
}

module.exports = new ContextManager();
