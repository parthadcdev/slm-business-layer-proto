/**
 * SLM Business Service Layer - RBAC Security
 *
 * @author Partha Chandramohan
 * @description Role-based access control system with permissions management and audit trail
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class RBACManager {
  constructor() {
    this.roles = {
      'super_admin': {
        name: 'Super Administrator',
        description: 'Full system access',
        level: 100,
        permissions: ['*'],
        inherits: []
      },
      'admin': {
        name: 'Administrator',
        description: 'Administrative access with some restrictions',
        level: 90,
        permissions: [
          'system:read', 'system:write', 'system:configure',
          'users:*', 'roles:*', 'permissions:*',
          'data:read', 'data:write', 'data:delete',
          'api:*', 'workflow:*', 'business:*'
        ],
        inherits: []
      },
      'manager': {
        name: 'Manager',
        description: 'Management level access',
        level: 70,
        permissions: [
          'users:read', 'users:write',
          'data:read', 'data:write',
          'api:read', 'api:write',
          'workflow:start', 'workflow:continue', 'workflow:complete',
          'business:validate', 'business:calculate', 'business:process'
        ],
        inherits: ['employee']
      },
      'employee': {
        name: 'Employee',
        description: 'Standard employee access',
        level: 50,
        permissions: [
          'users:read:own',
          'data:read',
          'api:read',
          'workflow:start', 'workflow:continue',
          'business:validate', 'business:calculate'
        ],
        inherits: ['user']
      },
      'user': {
        name: 'User',
        description: 'Basic user access',
        level: 30,
        permissions: [
          'users:read:own',
          'data:read:own',
          'business:validate'
        ],
        inherits: []
      },
      'readonly': {
        name: 'Read Only',
        description: 'Read-only access',
        level: 20,
        permissions: [
          'data:read',
          'api:read'
        ],
        inherits: []
      },
      'guest': {
        name: 'Guest',
        description: 'Limited guest access',
        level: 10,
        permissions: [
          'business:validate:basic'
        ],
        inherits: []
      }
    };

    this.resources = {
      'system': ['read', 'write', 'configure', 'admin'],
      'users': ['read', 'write', 'delete', 'admin'],
      'roles': ['read', 'write', 'delete', 'assign'],
      'permissions': ['read', 'write', 'grant', 'revoke'],
      'data': ['read', 'write', 'delete', 'export', 'import'],
      'api': ['read', 'write', 'execute', 'configure'],
      'workflow': ['start', 'continue', 'pause', 'complete', 'abort', 'admin'],
      'business': ['validate', 'calculate', 'process', 'configure']
    };

    this.sessions = new Map();
    this.tokenBlacklist = new Set();
  }

  async authenticate(credentials) {
    try {
      const { username, password, token } = credentials;

      if (token) {
        return await this.authenticateToken(token);
      }

      if (username && password) {
        return await this.authenticateCredentials(username, password);
      }

      throw new Error('Invalid authentication credentials');
    } catch (error) {
      console.error('Authentication failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async authenticateCredentials(username, password) {
    // In production, validate against secure user store
    const users = await this.getUserStore();
    const user = users.find(u => u.username === username);

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.active) {
      throw new Error('User account is disabled');
    }

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    // Create session
    const session = await this.createSession(user);

    return {
      success: true,
      user: this.sanitizeUser(user),
      token: session.token,
      expiresAt: session.expiresAt,
      permissions: await this.getUserPermissions(user.role)
    };
  }

  async authenticateToken(token) {
    if (this.tokenBlacklist.has(token)) {
      throw new Error('Token has been revoked');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
      const session = this.sessions.get(decoded.sessionId);

      if (!session || session.expiresAt < Date.now()) {
        throw new Error('Session expired');
      }

      if (session.token !== token) {
        throw new Error('Token mismatch');
      }

      // Update last activity
      session.lastActivity = Date.now();

      return {
        success: true,
        user: session.user,
        session: session,
        permissions: await this.getUserPermissions(session.user.role)
      };
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async createSession(user) {
    const sessionId = this.generateSessionId();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionId: sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt / 1000)
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'default-secret');

    const session = {
      id: sessionId,
      user: this.sanitizeUser(user),
      token: token,
      createdAt: Date.now(),
      expiresAt: expiresAt,
      lastActivity: Date.now(),
      ipAddress: null,
      userAgent: null
    };

    this.sessions.set(sessionId, session);

    return session;
  }

  async authorize(user, resource, action, context = {}) {
    try {
      if (!user || !user.role) {
        throw new Error('User role is required');
      }

      if (!this.roles[user.role]) {
        throw new Error(`Unknown role: ${user.role}`);
      }

      // Get all permissions for user (including inherited)
      const userPermissions = await this.getUserPermissions(user.role);

      // Check if user has wildcard permission
      if (userPermissions.includes('*')) {
        return {
          allowed: true,
          reason: 'Wildcard permission',
          level: 'full'
        };
      }

      // Check specific permission
      const permission = `${resource}:${action}`;
      if (userPermissions.includes(permission)) {
        return {
          allowed: true,
          reason: 'Direct permission match',
          level: 'full'
        };
      }

      // Check resource wildcard permission
      const resourceWildcard = `${resource}:*`;
      if (userPermissions.includes(resourceWildcard)) {
        return {
          allowed: true,
          reason: 'Resource wildcard permission',
          level: 'full'
        };
      }

      // Check contextual permissions (e.g., own data access)
      const contextualResult = await this.checkContextualPermission(user, resource, action, context);
      if (contextualResult.allowed) {
        return contextualResult;
      }

      // Check role hierarchy
      const hierarchyResult = await this.checkRoleHierarchy(user, resource, action);
      if (hierarchyResult.allowed) {
        return hierarchyResult;
      }

      return {
        allowed: false,
        reason: `Permission denied: ${permission}`,
        level: 'none'
      };
    } catch (error) {
      console.error('Authorization error:', error);
      return {
        allowed: false,
        reason: 'Authorization error',
        error: error.message
      };
    }
  }

  async checkContextualPermission(user, resource, action, context) {
    // Check for :own permissions
    const ownPermission = `${resource}:${action}:own`;
    const userPermissions = await this.getUserPermissions(user.role);

    if (userPermissions.includes(ownPermission)) {
      // Check if the resource belongs to the user
      if (context.resourceOwnerId === user.id) {
        return {
          allowed: true,
          reason: 'Own resource access',
          level: 'own'
        };
      }
    }

    // Check for conditional permissions based on context
    if (context.conditions) {
      const conditionalResult = await this.evaluateConditionalPermissions(user, resource, action, context.conditions);
      if (conditionalResult.allowed) {
        return conditionalResult;
      }
    }

    return { allowed: false };
  }

  async checkRoleHierarchy(user, resource, action) {
    const userRole = this.roles[user.role];
    const requiredLevel = this.getRequiredPermissionLevel(resource, action);

    if (userRole.level >= requiredLevel) {
      return {
        allowed: true,
        reason: 'Role hierarchy permission',
        level: 'hierarchy'
      };
    }

    return { allowed: false };
  }

  async evaluateConditionalPermissions(user, resource, action, conditions) {
    // Implement business logic for conditional permissions
    // For example: time-based, location-based, or state-based permissions

    if (conditions.timeRestricted) {
      const timeCheck = this.checkTimeRestriction(conditions.timeRestricted);
      if (!timeCheck) {
        return { allowed: false, reason: 'Time restriction violated' };
      }
    }

    if (conditions.departmentRestricted && user.department !== conditions.allowedDepartment) {
      return { allowed: false, reason: 'Department restriction violated' };
    }

    return { allowed: true, reason: 'Conditional permissions met', level: 'conditional' };
  }

  checkTimeRestriction(timeRestriction) {
    const now = new Date();
    const currentHour = now.getHours();

    if (timeRestriction.startHour && currentHour < timeRestriction.startHour) {
      return false;
    }

    if (timeRestriction.endHour && currentHour > timeRestriction.endHour) {
      return false;
    }

    return true;
  }

  async getUserPermissions(role) {
    if (!this.roles[role]) {
      return [];
    }

    const roleData = this.roles[role];
    let permissions = [...roleData.permissions];

    // Add inherited permissions
    for (const inheritedRole of roleData.inherits) {
      const inheritedPermissions = await this.getUserPermissions(inheritedRole);
      permissions = permissions.concat(inheritedPermissions);
    }

    // Remove duplicates
    return [...new Set(permissions)];
  }

  getRequiredPermissionLevel(resource, action) {
    const levelMap = {
      'system': { 'admin': 100, 'configure': 90, 'write': 80, 'read': 70 },
      'users': { 'admin': 90, 'delete': 80, 'write': 70, 'read': 50 },
      'data': { 'delete': 80, 'write': 60, 'read': 30 },
      'api': { 'configure': 80, 'execute': 50, 'write': 40, 'read': 30 }
    };

    return levelMap[resource]?.[action] || 50;
  }

  async assignRole(userId, newRole, assignedBy) {
    if (!this.roles[newRole]) {
      throw new Error(`Unknown role: ${newRole}`);
    }

    const assignerRole = this.roles[assignedBy.role];
    const targetRole = this.roles[newRole];

    // Check if assigner has permission to assign this role
    if (assignerRole.level <= targetRole.level) {
      throw new Error('Insufficient privileges to assign this role');
    }

    // In production, update user store
    const result = await this.updateUserRole(userId, newRole);

    // Log role assignment
    await this.logRoleAssignment(userId, newRole, assignedBy);

    return result;
  }

  async revokeRole(userId, revokedBy) {
    const defaultRole = 'user';
    return await this.assignRole(userId, defaultRole, revokedBy);
  }

  async createRole(roleData, createdBy) {
    if (this.roles[roleData.name]) {
      throw new Error('Role already exists');
    }

    const creatorRole = this.roles[createdBy.role];
    if (creatorRole.level < 90) {
      throw new Error('Insufficient privileges to create roles');
    }

    this.roles[roleData.name] = {
      name: roleData.displayName || roleData.name,
      description: roleData.description || '',
      level: roleData.level || 30,
      permissions: roleData.permissions || [],
      inherits: roleData.inherits || [],
      createdBy: createdBy.id,
      createdAt: new Date().toISOString()
    };

    return { success: true, role: roleData.name };
  }

  async deleteRole(roleName, deletedBy) {
    if (!this.roles[roleName]) {
      throw new Error('Role not found');
    }

    const defaultRoles = ['super_admin', 'admin', 'user', 'guest'];
    if (defaultRoles.includes(roleName)) {
      throw new Error('Cannot delete system roles');
    }

    const deleterRole = this.roles[deletedBy.role];
    if (deleterRole.level < 90) {
      throw new Error('Insufficient privileges to delete roles');
    }

    delete this.roles[roleName];
    return { success: true, deletedRole: roleName };
  }

  async logout(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.tokenBlacklist.add(session.token);
      this.sessions.delete(sessionId);
      return { success: true, message: 'Logged out successfully' };
    }

    return { success: false, message: 'Session not found' };
  }

  async refreshToken(oldToken) {
    try {
      const decoded = jwt.verify(oldToken, process.env.JWT_SECRET || 'default-secret', { ignoreExpiration: true });
      const session = this.sessions.get(decoded.sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      // Create new session
      const newSession = await this.createSession(session.user);

      // Invalidate old token
      this.tokenBlacklist.add(oldToken);
      this.sessions.delete(decoded.sessionId);

      return {
        success: true,
        token: newSession.token,
        expiresAt: newSession.expiresAt
      };
    } catch (error) {
      throw new Error('Token refresh failed');
    }
  }

  // Helper methods
  async getUserStore() {
    // In production, this would query a secure database
    return [
      {
        id: '1',
        username: 'admin',
        passwordHash: await this.hashPassword('admin123'),
        role: 'admin',
        active: true,
        department: 'IT'
      },
      {
        id: '2',
        username: 'manager',
        passwordHash: await this.hashPassword('manager123'),
        role: 'manager',
        active: true,
        department: 'Business'
      },
      {
        id: '3',
        username: 'employee',
        passwordHash: await this.hashPassword('employee123'),
        role: 'employee',
        active: true,
        department: 'Operations'
      }
    ];
  }

  async hashPassword(password) {
    return crypto.pbkdf2Sync(password, 'salt', 10000, 64, 'sha512').toString('hex');
  }

  async verifyPassword(password, hash) {
    const computed = await this.hashPassword(password);
    return computed === hash;
  }

  sanitizeUser(user) {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  async updateUserRole(userId, newRole) {
    // In production, update the user store
    return { success: true, userId, newRole };
  }

  async logRoleAssignment(userId, role, assignedBy) {
    const logEntry = {
      type: 'role_assignment',
      timestamp: new Date().toISOString(),
      userId,
      role,
      assignedBy: assignedBy.id,
      assignedByRole: assignedBy.role
    };

    console.log('RBAC Log:', JSON.stringify(logEntry));
  }

  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      return {
        id: session.id,
        user: session.user,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt
      };
    }
    return null;
  }

  getActiveSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      userId: session.user.id,
      username: session.user.username,
      role: session.user.role,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    }));
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.tokenBlacklist.add(session.token);
        this.sessions.delete(sessionId);
      }
    });

    return { cleaned: expiredSessions.length };
  }
}

module.exports = new RBACManager();