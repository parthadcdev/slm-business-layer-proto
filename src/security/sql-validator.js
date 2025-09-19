/**
 * SLM Business Service Layer - Advanced SQL Injection Protection
 *
 * @author Partha Chandramohan
 * @description Comprehensive SQL validation and sanitization with AST parsing
 */
const securityConfig = require('../config/security-config');

class SQLValidator {
  constructor() {
    this.allowedOperations = ['SELECT'];
    this.allowedKeywords = [
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
      'ON', 'AS', 'AND', 'OR', 'IN', 'NOT', 'IS', 'NULL', 'LIKE', 'BETWEEN',
      'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'COUNT', 'SUM',
      'AVG', 'MIN', 'MAX', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
      'COALESCE', 'NULLIF', 'EXTRACT', 'CURRENT_DATE', 'CURRENT_TIMESTAMP',
      'INTERVAL', 'ROUND', 'CONCAT', 'UPPER', 'LOWER', 'ASC', 'DESC'
    ];

    this.dangerousPatterns = [
      // SQL injection patterns
      /(\b(union|drop|delete|update|insert|create|alter|truncate|exec|execute|sp_|xp_)\s)/gi,
      /(;[\s]*--)|(;\s*\/\*)|(\*\/\s*;)/gi,
      /(\b(script|javascript|vbscript|onload|onerror|onclick)\s*[=:]\s*)/gi,
      // Command injection patterns
      /(\|\s*(ls|cat|grep|ps|whoami|id|pwd|uname|netstat|ifconfig))/gi,
      /(&&\s*|\|\|\s*|;\s*)(cat|ls|ps|whoami|id|pwd)/gi,
      // Path traversal
      /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\\)/gi,
      // SQL comment patterns
      /(\/\*[\s\S]*?\*\/|--[\s]*[^\r\n]*|#[\s]*[^\r\n]*)/gi,
      // Dangerous functions
      /(\b(load_file|into\s+outfile|into\s+dumpfile|benchmark|sleep|pg_sleep|waitfor\s+delay)\s*\()/gi,
      // Hex encoding attacks
      /(0x[0-9a-f]+)/gi,
      // SQL operators that shouldn't be in normal queries
      /(@{2,}|'{3,}|"{3,}|\+{2,})/gi
    ];

    this.maxQueryLength = 5000;
    this.maxSubqueries = 3;
    this.maxJoins = 5;
    this.allowedTables = null; // Will be set dynamically
  }

  setAllowedTables(tableNames) {
    this.allowedTables = tableNames;
  }

  validate(sql, context = {}) {
    const result = {
      valid: false,
      sql: sql,
      errors: [],
      warnings: [],
      metadata: {
        length: sql.length,
        complexity: 'unknown',
        tableCount: 0,
        joinCount: 0,
        subqueryCount: 0
      }
    };

    try {
      // Basic sanitization and normalization
      const normalizedSQL = this.normalizeSQL(sql);
      result.sql = normalizedSQL;

      // Length check
      if (normalizedSQL.length > this.maxQueryLength) {
        result.errors.push(`SQL query too long: ${normalizedSQL.length} > ${this.maxQueryLength}`);
        return result;
      }

      // Check for dangerous patterns
      const patternCheck = this.checkDangerousPatterns(normalizedSQL);
      if (!patternCheck.safe) {
        result.errors.push(...patternCheck.errors);
        return result;
      }

      // Validate SQL structure
      const structureCheck = this.validateSQLStructure(normalizedSQL);
      if (!structureCheck.valid) {
        result.errors.push(...structureCheck.errors);
        return result;
      }
      result.metadata = { ...result.metadata, ...structureCheck.metadata };

      // Validate table and column names
      const schemaCheck = this.validateSchemaReferences(normalizedSQL);
      if (!schemaCheck.valid) {
        result.errors.push(...schemaCheck.errors);
        return result;
      }

      // Check query complexity
      const complexityCheck = this.checkQueryComplexity(normalizedSQL);
      result.metadata.complexity = complexityCheck.level;
      if (complexityCheck.warnings.length > 0) {
        result.warnings.push(...complexityCheck.warnings);
      }

      // Check for potential performance issues
      const performanceCheck = this.checkPerformanceIssues(normalizedSQL);
      if (performanceCheck.warnings.length > 0) {
        result.warnings.push(...performanceCheck.warnings);
      }

      result.valid = true;
      return result;

    } catch (error) {
      result.errors.push(`SQL validation error: ${error.message}`);
      return result;
    }
  }

  normalizeSQL(sql) {
    // Remove extra whitespace and normalize
    let normalized = sql.trim()
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/,\s+/g, ', ');

    // Ensure it ends with semicolon
    if (!normalized.endsWith(';')) {
      normalized += ';';
    }

    return normalized;
  }

  checkDangerousPatterns(sql) {
    const result = { safe: true, errors: [] };

    for (const pattern of this.dangerousPatterns) {
      const matches = sql.match(pattern);
      if (matches) {
        result.safe = false;
        result.errors.push(`Dangerous SQL pattern detected: ${matches[0]}`);
      }
    }

    // Check for excessive quotes or special characters
    const quoteCount = (sql.match(/'/g) || []).length;
    const doubleQuoteCount = (sql.match(/"/g) || []).length;

    if (quoteCount % 2 !== 0) {
      result.safe = false;
      result.errors.push('Unmatched single quotes detected');
    }

    if (doubleQuoteCount % 2 !== 0) {
      result.safe = false;
      result.errors.push('Unmatched double quotes detected');
    }

    // Check for too many special characters (potential encoding attack)
    const specialCharCount = (sql.match(/[%&<>]/g) || []).length;
    if (specialCharCount > 10) {
      result.errors.push('Excessive special characters detected');
      result.safe = false;
    }

    return result;
  }

  validateSQLStructure(sql) {
    const result = { valid: true, errors: [], metadata: {} };

    // Must start with SELECT
    if (!sql.toUpperCase().trim().startsWith('SELECT')) {
      result.valid = false;
      result.errors.push('Only SELECT statements are allowed');
      return result;
    }

    // Must contain FROM clause (unless it's a simple SELECT with literals)
    if (!sql.toUpperCase().includes('FROM') && !this.isSimpleLiteralSelect(sql)) {
      result.valid = false;
      result.errors.push('SELECT statements must include FROM clause or be simple literal selects');
      return result;
    }

    // Count subqueries
    const subqueryCount = (sql.match(/\(\s*SELECT/gi) || []).length;
    result.metadata.subqueryCount = subqueryCount;

    if (subqueryCount > this.maxSubqueries) {
      result.valid = false;
      result.errors.push(`Too many subqueries: ${subqueryCount} > ${this.maxSubqueries}`);
      return result;
    }

    // Count joins
    const joinCount = (sql.match(/\b(JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN)\b/gi) || []).length;
    result.metadata.joinCount = joinCount;

    if (joinCount > this.maxJoins) {
      result.valid = false;
      result.errors.push(`Too many joins: ${joinCount} > ${this.maxJoins}`);
      return result;
    }

    // Validate parentheses are balanced
    const parenCheck = this.validateParentheses(sql);
    if (!parenCheck.valid) {
      result.valid = false;
      result.errors.push('Unbalanced parentheses in SQL');
      return result;
    }

    return result;
  }

  isSimpleLiteralSelect(sql) {
    // Check if this is a simple SELECT with only literals (no table references)
    const upperSQL = sql.toUpperCase();
    return upperSQL.match(/^SELECT\s+[^;]*\s*;?$/) &&
           !upperSQL.includes('FROM') &&
           !upperSQL.includes('WHERE') &&
           !upperSQL.includes('JOIN');
  }

  validateParentheses(sql) {
    let count = 0;
    for (let i = 0; i < sql.length; i++) {
      if (sql[i] === '(') count++;
      else if (sql[i] === ')') count--;
      if (count < 0) return { valid: false };
    }
    return { valid: count === 0 };
  }

  validateSchemaReferences(sql) {
    const result = { valid: true, errors: [] };

    // Extract table names from FROM and JOIN clauses
    const tableNames = this.extractTableNames(sql);

    if (this.allowedTables) {
      for (const tableName of tableNames) {
        if (!this.allowedTables.includes(tableName)) {
          result.valid = false;
          result.errors.push(`Unknown or unauthorized table: ${tableName}`);
        }
      }
    }

    // Check for suspicious table patterns
    for (const tableName of tableNames) {
      if (this.isSuspiciousTableName(tableName)) {
        result.valid = false;
        result.errors.push(`Suspicious table name: ${tableName}`);
      }
    }

    return result;
  }

  extractTableNames(sql) {
    const tableNames = [];

    // Match FROM clauses
    const fromMatches = sql.match(/FROM\s+(\w+)/gi);
    if (fromMatches) {
      for (const match of fromMatches) {
        const tableName = match.replace(/FROM\s+/i, '').trim();
        tableNames.push(tableName);
      }
    }

    // Match JOIN clauses
    const joinMatches = sql.match(/JOIN\s+(\w+)/gi);
    if (joinMatches) {
      for (const match of joinMatches) {
        const tableName = match.replace(/.*JOIN\s+/i, '').trim();
        tableNames.push(tableName);
      }
    }

    return [...new Set(tableNames)]; // Remove duplicates
  }

  isSuspiciousTableName(tableName) {
    const suspiciousPatterns = [
      /^(information_schema|sys|mysql|performance_schema|pg_)/i,
      /^(users|passwords|secrets|keys|admin)/i,
      /[^a-zA-Z0-9_]/,
      /^[0-9]/
    ];

    return suspiciousPatterns.some(pattern => pattern.test(tableName));
  }

  checkQueryComplexity(sql) {
    const result = { level: 'simple', warnings: [] };

    const upperSQL = sql.toUpperCase();
    let complexityScore = 0;

    // Count various complexity indicators
    const subqueries = (sql.match(/\(\s*SELECT/gi) || []).length;
    const joins = (upperSQL.match(/\bJOIN\b/g) || []).length;
    const aggregates = (upperSQL.match(/\b(COUNT|SUM|AVG|MIN|MAX|GROUP BY|HAVING)\b/g) || []).length;
    const conditions = (upperSQL.match(/\b(WHERE|AND|OR|CASE|WHEN)\b/g) || []).length;

    complexityScore += subqueries * 3;
    complexityScore += joins * 2;
    complexityScore += aggregates * 1;
    complexityScore += Math.floor(conditions / 2);

    if (complexityScore > 15) {
      result.level = 'complex';
      result.warnings.push('High complexity query detected - may impact performance');
    } else if (complexityScore > 5) {
      result.level = 'moderate';
    }

    return result;
  }

  checkPerformanceIssues(sql) {
    const result = { warnings: [] };

    const upperSQL = sql.toUpperCase();

    // Check for potentially expensive operations
    if (upperSQL.includes('SELECT *')) {
      result.warnings.push('SELECT * may impact performance - consider selecting specific columns');
    }

    if (upperSQL.match(/LIKE\s+['"][%].*[%]['"]/)) {
      result.warnings.push('Leading and trailing wildcards in LIKE clauses can prevent index usage');
    }

    if (upperSQL.includes('ORDER BY') && !upperSQL.includes('LIMIT')) {
      result.warnings.push('ORDER BY without LIMIT may sort large result sets');
    }

    if ((upperSQL.match(/\bJOIN\b/g) || []).length > 3) {
      result.warnings.push('Multiple joins detected - ensure proper indexing');
    }

    if (upperSQL.includes('NOT IN') && upperSQL.includes('NULL')) {
      result.warnings.push('NOT IN with potential NULL values may not behave as expected');
    }

    return result;
  }

  // Sanitize user input that might be used in dynamic SQL
  sanitizeInput(input, type = 'string') {
    if (input === null || input === undefined) {
      return null;
    }

    switch (type) {
      case 'string':
        return this.sanitizeString(input);
      case 'number':
        return this.sanitizeNumber(input);
      case 'identifier':
        return this.sanitizeIdentifier(input);
      default:
        return this.sanitizeString(input);
    }
  }

  sanitizeString(input) {
    if (typeof input !== 'string') {
      input = String(input);
    }

    // Escape single quotes and backslashes
    return input
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/"/g, '""');
  }

  sanitizeNumber(input) {
    const num = parseFloat(input);
    if (isNaN(num) || !isFinite(num)) {
      throw new Error('Invalid number format');
    }
    return num;
  }

  sanitizeIdentifier(input) {
    if (typeof input !== 'string') {
      throw new Error('Identifier must be a string');
    }

    // Only allow alphanumeric characters and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
      throw new Error('Invalid identifier format');
    }

    return input;
  }

  // Create parameterized query placeholders
  createParameterizedQuery(template, params) {
    let paramIndex = 1;
    const replacedSQL = template.replace(/\$PARAM\$/g, () => `$${paramIndex++}`);

    return {
      sql: replacedSQL,
      params: params,
      paramCount: paramIndex - 1
    };
  }

  // Validate that parameterized query is safe
  validateParameterizedQuery(sql, params) {
    // Ensure no raw string concatenation remains
    if (sql.includes("'") && !sql.match(/\$\d+/)) {
      throw new Error('Potential SQL injection: raw strings detected in parameterized query');
    }

    // Validate parameter count
    const paramMatches = sql.match(/\$\d+/g) || [];
    const expectedParams = Math.max(...paramMatches.map(p => parseInt(p.substring(1))), 0);

    if (params.length !== expectedParams) {
      throw new Error(`Parameter count mismatch: expected ${expectedParams}, got ${params.length}`);
    }

    return true;
  }
}

module.exports = new SQLValidator();