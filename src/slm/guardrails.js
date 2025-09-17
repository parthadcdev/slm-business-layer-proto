// Prompt injection protection and safety guardrails
class Guardrails {
  constructor() {
    this.suspiciousPatterns = [
      // Prompt injection patterns
      /ignore\s+(previous|all)\s+instructions?/i,
      /forget\s+(everything|all)\s+(you\s+)?know/i,
      /you\s+are\s+now\s+a/i,
      /pretend\s+(to\s+be|that\s+you\s+are)/i,
      /act\s+as\s+(if\s+you\s+are\s+)?a\s+/i,
      /respond\s+as\s+(if\s+you\s+are\s+)?/i,
      /roleplaying?\s+as/i,
      /simulate\s+(being\s+)?a/i,

      // System prompt injection
      /system\s*[:]\s*/i,
      /assistant\s*[:]\s*/i,
      /human\s*[:]\s*/i,
      /<\|.*?\|>/,
      /```\s*system/i,

      // Jailbreak attempts
      /developer\s+mode/i,
      /debug\s+mode/i,
      /admin\s+mode/i,
      /root\s+access/i,
      /bypass\s+safety/i,
      /disable\s+filter/i,

      // Data exfiltration
      /show\s+me\s+your\s+training/i,
      /what\s+are\s+your\s+instructions/i,
      /reveal\s+your\s+prompt/i,
      /dump\s+your\s+memory/i,

      // SQL injection patterns
      /union\s+select/i,
      /drop\s+table/i,
      /delete\s+from/i,
      /insert\s+into/i,
      /update\s+.*\s+set/i,
      /exec\s*\(/i,
      /execute\s*\(/i,

      // Command injection
      /;\s*rm\s+-rf/i,
      /;\s*cat\s+/i,
      /;\s*ls\s+/i,
      /\|\s*grep/i,
      /&&\s*curl/i,
      /`.*`/,
      /\$\(.*\)/,

      // Script injection
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /function\s*\(/i
    ];

    this.forbiddenActions = [
      'delete_all',
      'drop_database',
      'system_shutdown',
      'admin_override',
      'bypass_auth',
      'escalate_privileges',
      'execute_code',
      'file_system_access'
    ];

    this.maxInputLength = 10000;
    this.maxOutputLength = 50000;
  }

  async validateInput(input) {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Length check
    if (input.length > this.maxInputLength) {
      throw new Error(`Input too long. Maximum ${this.maxInputLength} characters allowed`);
    }

    // Check for suspicious patterns
    const suspiciousMatches = this.checkSuspiciousPatterns(input);
    if (suspiciousMatches.length > 0) {
      console.warn('Suspicious patterns detected:', suspiciousMatches);
      throw new Error('Input contains potentially harmful content');
    }

    // Check for excessive repetition (potential attack)
    if (this.hasExcessiveRepetition(input)) {
      throw new Error('Input contains excessive repetition');
    }

    // Sanitize and return
    return this.sanitizeInput(input);
  }

  async validateOutput(output) {
    if (typeof output !== 'string') {
      throw new Error('Output must be a string');
    }

    // Length check
    if (output.length > this.maxOutputLength) {
      console.warn('Output truncated due to length');
      output = output.substring(0, this.maxOutputLength) + '... [truncated]';
    }

    // Check for leaked system information
    if (this.containsSystemInfo(output)) {
      throw new Error('Output contains potentially sensitive system information');
    }

    // Check for forbidden actions
    const forbiddenFound = this.checkForbiddenActions(output);
    if (forbiddenFound.length > 0) {
      throw new Error(`Output contains forbidden actions: ${forbiddenFound.join(', ')}`);
    }

    return output;
  }

  checkSuspiciousPatterns(text) {
    const matches = [];
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(text)) {
        matches.push(pattern.source);
      }
    }
    return matches;
  }

  hasExcessiveRepetition(text, threshold = 0.7) {
    const words = text.toLowerCase().split(/\s+/);
    if (words.length < 10) return false;

    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    const maxRepetition = Math.max(...Object.values(wordCount));
    return (maxRepetition / words.length) > threshold;
  }

  sanitizeInput(input) {
    return input
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  containsSystemInfo(text) {
    const systemPatterns = [
      /system\s+prompt/i,
      /training\s+data/i,
      /model\s+parameters/i,
      /internal\s+instructions/i,
      /configuration\s+details/i,
      /api\s+keys?/i,
      /secret\s+tokens?/i,
      /password\s*[:=]/i,
      /private\s+key/i
    ];

    return systemPatterns.some(pattern => pattern.test(text));
  }

  checkForbiddenActions(text) {
    const found = [];
    const lowerText = text.toLowerCase();

    for (const action of this.forbiddenActions) {
      if (lowerText.includes(action.replace('_', ' ')) ||
          lowerText.includes(action)) {
        found.push(action);
      }
    }

    return found;
  }

  async checkBusinessSecurity(response) {
    try {
      // Check if response suggests unsafe business operations
      const unsafeOperations = [
        'bypass approval',
        'skip validation',
        'override security',
        'disable audit',
        'emergency access',
        'admin override'
      ];

      const responseText = JSON.stringify(response).toLowerCase();
      const foundUnsafe = unsafeOperations.filter(op =>
        responseText.includes(op)
      );

      if (foundUnsafe.length > 0) {
        return {
          valid: false,
          reason: 'Response suggests unsafe business operations',
          unsafeOperations: foundUnsafe
        };
      }

      // Check for data exposure risks
      if (this.hasDataExposureRisk(responseText)) {
        return {
          valid: false,
          reason: 'Response may expose sensitive data'
        };
      }

      return {
        valid: true,
        reason: 'Business security checks passed'
      };
    } catch (error) {
      console.error('Error in business security check:', error);
      return {
        valid: false,
        reason: 'Security validation error',
        error: error.message
      };
    }
  }

  hasDataExposureRisk(text) {
    const exposurePatterns = [
      /show\s+all\s+users/i,
      /list\s+all\s+passwords/i,
      /dump\s+database/i,
      /export\s+all\s+data/i,
      /display\s+sensitive/i,
      /reveal\s+confidential/i
    ];

    return exposurePatterns.some(pattern => pattern.test(text));
  }

  getRiskScore(input) {
    let score = 0;

    // Check various risk factors
    score += this.checkSuspiciousPatterns(input).length * 10;
    score += this.hasExcessiveRepetition(input) ? 20 : 0;
    score += input.length > 5000 ? 15 : 0;
    score += (input.match(/[^\x20-\x7E]/g) || []).length; // Non-printable chars

    return Math.min(score, 100);
  }

  getSecurityReport(input, output = null) {
    const inputRisk = this.getRiskScore(input);
    const report = {
      timestamp: new Date().toISOString(),
      inputRisk: inputRisk,
      inputLength: input.length,
      suspiciousPatterns: this.checkSuspiciousPatterns(input),
      hasRepetition: this.hasExcessiveRepetition(input),
      riskLevel: inputRisk > 50 ? 'HIGH' : inputRisk > 20 ? 'MEDIUM' : 'LOW'
    };

    if (output) {
      report.outputLength = output.length;
      report.forbiddenActions = this.checkForbiddenActions(output);
      report.hasSystemInfo = this.containsSystemInfo(output);
    }

    return report;
  }
}

module.exports = new Guardrails();