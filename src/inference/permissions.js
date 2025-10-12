// Permission validation system
class PermissionManager {
  constructor() {
    this.rolePermissions = {
      admin: {
        database: [
          "select",
          "insert",
          "update",
          "delete",
          "count",
          "aggregate",
        ],
        api: ["*"],
        business: ["*"],
        workflow: ["*"],
      },
      manager: {
        database: ["select", "insert", "update", "count"],
        api: ["user-service", "order-service", "notification-service"],
        business: ["validate", "calculate", "process", "notify"],
        workflow: ["start", "continue", "pause", "complete"],
      },
      employee: {
        database: ["select", "count"],
        api: ["user-service:getUser", "order-service:getOrder"],
        business: ["validate", "calculate"],
        workflow: ["start", "continue"],
      },
      readonly: {
        database: ["select", "count"],
        api: ["user-service:getUser"],
        business: ["validate"],
        workflow: [],
      },
      guest: {
        database: [],
        api: [],
        business: ["validate"],
        workflow: [],
      },
    };

    this.resourcePermissions = {
      users: {
        admin: ["read", "write", "delete"],
        manager: ["read", "write"],
        employee: ["read"],
        readonly: ["read"],
        guest: [],
      },
      orders: {
        admin: ["read", "write", "delete"],
        manager: ["read", "write"],
        employee: ["read"],
        readonly: ["read"],
        guest: [],
      },
      products: {
        admin: ["read", "write", "delete"],
        manager: ["read"],
        employee: ["read"],
        readonly: ["read"],
        guest: ["read"],
      },
      payments: {
        admin: ["read", "write"],
        manager: ["read"],
        employee: [],
        readonly: [],
        guest: [],
      },
    };

    this.timeBasedRestrictions = {
      business_hours: {
        start: "09:00",
        end: "17:00",
        timezone: "UTC",
        days: [1, 2, 3, 4, 5], // Monday to Friday
      },
    };

    this.rateLimits = {
      admin: { requests: 1000, window: 3600 },
      manager: { requests: 500, window: 3600 },
      employee: { requests: 200, window: 3600 },
      readonly: { requests: 100, window: 3600 },
      guest: { requests: 50, window: 3600 },
    };

    this.requestCounts = new Map();
  }

  async checkActionPermission(actionType, operation, parameters, context) {
    try {
      const user = context.user || { role: "guest", id: "anonymous" };

      // Check basic role permissions
      const roleCheck = this.checkRolePermission(
        user.role,
        actionType,
        operation,
      );
      if (!roleCheck.allowed) {
        return roleCheck;
      }

      // Check resource-specific permissions
      const resourceCheck = await this.checkResourcePermission(
        user,
        actionType,
        operation,
        parameters,
      );
      if (!resourceCheck.allowed) {
        return resourceCheck;
      }

      // Check time-based restrictions
      const timeCheck = this.checkTimeRestrictions(user.role, context);
      if (!timeCheck.allowed) {
        return timeCheck;
      }

      // Check rate limits
      const rateCheck = await this.checkRateLimit(user, context);
      if (!rateCheck.allowed) {
        return rateCheck;
      }

      // Check context-specific permissions
      const contextCheck = await this.checkContextPermissions(
        user,
        actionType,
        operation,
        parameters,
        context,
      );
      if (!contextCheck.allowed) {
        return contextCheck;
      }

      return {
        allowed: true,
        reason: "Permission granted",
        permissions: {
          role: user.role,
          actionType,
          operation,
          resourceAccess: resourceCheck.access,
        },
      };
    } catch (error) {
      console.error("Permission check failed:", error);
      return {
        allowed: false,
        reason: "Permission validation error",
        error: error.message,
      };
    }
  }

  checkRolePermission(role, actionType, operation) {
    if (!this.rolePermissions[role]) {
      return {
        allowed: false,
        reason: `Unknown role: ${role}`,
      };
    }

    const rolePerms = this.rolePermissions[role][actionType];
    if (!rolePerms) {
      return {
        allowed: false,
        reason: `No permissions for action type: ${actionType}`,
      };
    }

    // Check if role has wildcard access
    if (rolePerms.includes("*")) {
      return { allowed: true, reason: "Wildcard permission" };
    }

    // Check specific operation permission
    if (rolePerms.includes(operation)) {
      return { allowed: true, reason: "Operation permitted" };
    }

    // Check service-specific permissions for API actions
    if (actionType === "api") {
      const serviceOperation = `${this.extractService(operation)}:${operation}`;
      if (rolePerms.includes(serviceOperation)) {
        return { allowed: true, reason: "Service operation permitted" };
      }

      // Check service-level permission
      const service = this.extractService(operation);
      if (rolePerms.includes(service)) {
        return { allowed: true, reason: "Service permitted" };
      }
    }

    return {
      allowed: false,
      reason: `Operation '${operation}' not permitted for role '${role}'`,
    };
  }

  async checkResourcePermission(user, actionType, operation, parameters) {
    if (actionType !== "database") {
      return { allowed: true, access: "full" };
    }

    const table = parameters.table || this.extractTableFromOperation(operation);
    if (!table) {
      return { allowed: true, access: "none" };
    }

    const resourcePerms = this.resourcePermissions[table];
    if (!resourcePerms) {
      return {
        allowed: false,
        reason: `No resource permissions defined for table: ${table}`,
      };
    }

    const userAccess = resourcePerms[user.role] || [];
    const requiredAccess = this.getRequiredAccess(operation);

    if (userAccess.includes(requiredAccess)) {
      return {
        allowed: true,
        access: requiredAccess,
        resource: table,
      };
    }

    return {
      allowed: false,
      reason: `Insufficient permissions for ${requiredAccess} access to ${table}`,
      required: requiredAccess,
      available: userAccess,
    };
  }

  checkTimeRestrictions(role, context) {
    if (role === "admin") {
      return { allowed: true, reason: "Admin bypasses time restrictions" };
    }

    const now = new Date();
    const restrictions = this.timeBasedRestrictions.business_hours;

    // Check day of week (0 = Sunday, 1 = Monday, etc.)
    if (!restrictions.days.includes(now.getUTCDay())) {
      return {
        allowed: false,
        reason: "Operations not allowed on weekends",
      };
    }

    // Check time of day
    const currentTime = now.getUTCHours() * 100 + now.getUTCMinutes();
    const startTime = parseInt(restrictions.start.replace(":", ""));
    const endTime = parseInt(restrictions.end.replace(":", ""));

    if (currentTime < startTime || currentTime > endTime) {
      return {
        allowed: false,
        reason: `Operations only allowed during business hours (${restrictions.start}-${restrictions.end} UTC)`,
      };
    }

    return { allowed: true, reason: "Within business hours" };
  }

  async checkRateLimit(user, context) {
    const limit = this.rateLimits[user.role] || this.rateLimits.guest;
    const key = `${user.role}_${user.id}`;
    const now = Date.now();

    if (!this.requestCounts.has(key)) {
      this.requestCounts.set(key, { count: 0, windowStart: now });
    }

    const counter = this.requestCounts.get(key);

    // Reset window if needed
    if (now - counter.windowStart > limit.window * 1000) {
      counter.count = 0;
      counter.windowStart = now;
    }

    // Check limit
    if (counter.count >= limit.requests) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limit.requests} requests per ${limit.window} seconds`,
        retryAfter:
          limit.window - Math.floor((now - counter.windowStart) / 1000),
      };
    }

    counter.count++;
    return { allowed: true, reason: "Within rate limit" };
  }

  async checkContextPermissions(
    user,
    actionType,
    operation,
    parameters,
    context,
  ) {
    // Check user ownership for data access
    if (actionType === "database" && parameters.where) {
      const ownershipCheck = this.checkDataOwnership(user, parameters, context);
      if (!ownershipCheck.allowed) {
        return ownershipCheck;
      }
    }

    // Check IP restrictions if configured
    if (context.ipAddress) {
      const ipCheck = this.checkIPRestrictions(user, context.ipAddress);
      if (!ipCheck.allowed) {
        return ipCheck;
      }
    }

    // Check session validity
    if (context.sessionId) {
      const sessionCheck = await this.checkSessionValidity(
        user,
        context.sessionId,
      );
      if (!sessionCheck.allowed) {
        return sessionCheck;
      }
    }

    return { allowed: true, reason: "Context checks passed" };
  }

  checkDataOwnership(user, parameters, context) {
    // For non-admin users, restrict access to their own data
    if (user.role !== "admin" && user.role !== "manager") {
      const table = parameters.table;

      // Check if user is trying to access their own data
      if (
        table === "users" &&
        parameters.where &&
        parameters.where.id !== user.id
      ) {
        return {
          allowed: false,
          reason: "Users can only access their own data",
        };
      }

      if (
        table === "orders" &&
        parameters.where &&
        parameters.where.user_id !== user.id
      ) {
        return {
          allowed: false,
          reason: "Users can only access their own orders",
        };
      }
    }

    return { allowed: true, reason: "Data ownership check passed" };
  }

  checkIPRestrictions(user, ipAddress) {
    // Implement IP whitelist/blacklist if needed
    // For now, allow all IPs
    return { allowed: true, reason: "IP restrictions passed" };
  }

  async checkSessionValidity(user, sessionId) {
    // Implement session validation logic
    // For now, assume all sessions are valid
    return { allowed: true, reason: "Session is valid" };
  }

  getRequiredAccess(operation) {
    const accessMap = {
      select: "read",
      count: "read",
      insert: "write",
      update: "write",
      delete: "delete",
    };

    return accessMap[operation] || "read";
  }

  extractService(operation) {
    // Extract service name from operation
    const serviceMap = {
      getUser: "user-service",
      updateProfile: "user-service",
      validateUser: "user-service",
      createOrder: "order-service",
      getOrder: "order-service",
      updateOrderStatus: "order-service",
      cancelOrder: "order-service",
      processPayment: "payment-service",
      refundPayment: "payment-service",
      getPaymentStatus: "payment-service",
      sendEmail: "notification-service",
      sendSMS: "notification-service",
      sendPushNotification: "notification-service",
    };

    return serviceMap[operation] || "unknown-service";
  }

  extractTableFromOperation(operation) {
    // Extract table name from database operation context
    // This would typically be provided in parameters
    return null;
  }

  async grantTemporaryPermission(user, actionType, operation, duration = 3600) {
    const permissionKey = `temp_${user.id}_${actionType}_${operation}`;
    const expiry = Date.now() + duration * 1000;

    // Store temporary permission (in production, use a proper store)
    this.tempPermissions = this.tempPermissions || new Map();
    this.tempPermissions.set(permissionKey, { expiry, granted: Date.now() });

    return {
      granted: true,
      permissionKey,
      expiresAt: new Date(expiry).toISOString(),
      duration,
    };
  }

  async revokeTemporaryPermission(permissionKey) {
    if (this.tempPermissions && this.tempPermissions.has(permissionKey)) {
      this.tempPermissions.delete(permissionKey);
      return { revoked: true, permissionKey };
    }

    return { revoked: false, reason: "Permission not found" };
  }

  async getUserPermissions(user) {
    const role = user.role || "guest";

    return {
      role: role,
      database: this.rolePermissions[role]?.database || [],
      api: this.rolePermissions[role]?.api || [],
      business: this.rolePermissions[role]?.business || [],
      workflow: this.rolePermissions[role]?.workflow || [],
      resources: Object.keys(this.resourcePermissions).reduce(
        (acc, resource) => {
          acc[resource] = this.resourcePermissions[resource][role] || [];
          return acc;
        },
        {},
      ),
      rateLimit: this.rateLimits[role] || this.rateLimits.guest,
      timeRestrictions:
        role === "admin" ? null : this.timeBasedRestrictions.business_hours,
    };
  }

  async auditPermissionCheck(user, actionType, operation, result, context) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      user: {
        id: user.id,
        role: user.role,
      },
      action: {
        type: actionType,
        operation: operation,
      },
      result: {
        allowed: result.allowed,
        reason: result.reason,
      },
      context: {
        sessionId: context.sessionId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    };

    // Log audit entry (in production, store in secure audit log)
    console.log("Permission Audit:", JSON.stringify(auditEntry));

    return auditEntry;
  }
}

module.exports = new PermissionManager();
