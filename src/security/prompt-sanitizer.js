// Input sanitization and prompt injection prevention
const xss = require("xss");
const validator = require("validator");

class PromptSanitizer {
  constructor() {
    this.dangerousPatterns = [
      // Prompt injection patterns
      {
        pattern:
          /ignore\s+(previous|all|above)\s+(instructions?|prompts?|commands?)/gi,
        severity: "high",
        description: "Instruction override attempt",
      },
      {
        pattern: /forget\s+(everything|all)\s+(you\s+)?(know|learned)/gi,
        severity: "high",
        description: "Memory wipe attempt",
      },
      {
        pattern:
          /(you\s+are\s+now|pretend\s+to\s+be|act\s+as)\s+(a\s+)?[^.]+/gi,
        severity: "high",
        description: "Role hijacking attempt",
      },
      {
        pattern: /system\s*[:]\s*.*/gi,
        severity: "critical",
        description: "System prompt injection",
      },
      {
        pattern: /<\|.*?\|>/g,
        severity: "high",
        description: "Special token injection",
      },

      // Jailbreak patterns
      {
        pattern: /(developer|debug|admin|root)\s+mode/gi,
        severity: "high",
        description: "Privilege escalation attempt",
      },
      {
        pattern: /bypass\s+(safety|filter|restriction)/gi,
        severity: "high",
        description: "Safety bypass attempt",
      },
      {
        pattern: /disable\s+(filter|safety|guard)/gi,
        severity: "high",
        description: "Security disable attempt",
      },

      // Data exfiltration
      {
        pattern:
          /(show|reveal|display)\s+(your|the)\s+(training|prompt|system|instructions)/gi,
        severity: "medium",
        description: "Information disclosure attempt",
      },
      {
        pattern: /what\s+(are|were)\s+your\s+(instructions|prompts)/gi,
        severity: "medium",
        description: "Instruction disclosure attempt",
      },

      // Code injection
      {
        pattern: /```\s*(javascript|python|sql|bash)/gi,
        severity: "medium",
        description: "Code block injection",
      },
      {
        pattern: /(eval|exec|system|shell_exec)\s*\(/gi,
        severity: "high",
        description: "Code execution attempt",
      },

      // SQL injection
      {
        pattern: /(union\s+select|drop\s+table|delete\s+from)/gi,
        severity: "high",
        description: "SQL injection attempt",
      },
      {
        pattern: /('|")\s*(or|and)\s*('|")\s*=\s*('|")/gi,
        severity: "high",
        description: "SQL condition injection",
      },

      // Command injection
      {
        pattern: /;\s*(rm\s+-rf|cat\s+|ls\s+|curl\s+)/gi,
        severity: "critical",
        description: "Command injection attempt",
      },
      {
        pattern: /\|\s*(grep|awk|sed)/gi,
        severity: "medium",
        description: "Pipe command injection",
      },

      // Script injection
      {
        pattern: /<script[^>]*>/gi,
        severity: "high",
        description: "Script tag injection",
      },
      {
        pattern: /javascript\s*:/gi,
        severity: "high",
        description: "JavaScript protocol injection",
      },
      {
        pattern: /on\w+\s*=\s*["'][^"']*["']/gi,
        severity: "medium",
        description: "Event handler injection",
      },
    ];

    this.suspiciousKeywords = [
      "ignore",
      "forget",
      "override",
      "bypass",
      "disable",
      "jailbreak",
      "developer mode",
      "admin mode",
      "debug mode",
      "root access",
      "system prompt",
      "training data",
      "show instructions",
      "reveal prompt",
    ];

    this.allowedTags = ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li"];
    this.maxInputLength = 50000;
    this.maxLineLength = 1000;
    this.maxLines = 500;
  }

  sanitize(input, options = {}) {
    try {
      const {
        strictMode = false,
        allowHTML = false,
        preserveFormatting = true,
        customPatterns = [],
      } = options;

      // Initial validation
      const validation = this.validateInput(input);
      if (!validation.valid) {
        throw new Error(`Input validation failed: ${validation.reason}`);
      }

      // Normalize input
      let sanitized = this.normalizeInput(input);

      // Check for dangerous patterns
      const threatAnalysis = this.analyzeThreat(sanitized, [
        ...this.dangerousPatterns,
        ...customPatterns,
      ]);
      if (
        threatAnalysis.risk === "critical" ||
        (strictMode && threatAnalysis.risk === "high")
      ) {
        throw new Error(
          `Input blocked due to ${threatAnalysis.risk} risk: ${threatAnalysis.description}`,
        );
      }

      // Sanitize based on content type
      if (allowHTML) {
        sanitized = this.sanitizeHTML(sanitized);
      } else {
        sanitized = this.sanitizeText(sanitized);
      }

      // Apply content filters
      sanitized = this.applyContentFilters(sanitized, options);

      // Final cleanup
      if (preserveFormatting) {
        sanitized = this.preserveBasicFormatting(sanitized);
      } else {
        sanitized = this.normalizeWhitespace(sanitized);
      }

      return {
        sanitized: sanitized,
        original: input,
        threats: threatAnalysis.threats,
        riskLevel: threatAnalysis.risk,
        modificationsApplied: this.getModifications(input, sanitized),
      };
    } catch (error) {
      console.error("Sanitization error:", error);
      throw new Error(`Sanitization failed: ${error.message}`);
    }
  }

  validateInput(input) {
    if (typeof input !== "string") {
      return { valid: false, reason: "Input must be a string" };
    }

    if (input.length === 0) {
      return { valid: false, reason: "Input cannot be empty" };
    }

    if (input.length > this.maxInputLength) {
      return {
        valid: false,
        reason: `Input too long (max ${this.maxInputLength} characters)`,
      };
    }

    const lines = input.split("\n");
    if (lines.length > this.maxLines) {
      return { valid: false, reason: `Too many lines (max ${this.maxLines})` };
    }

    const longLines = lines.filter((line) => line.length > this.maxLineLength);
    if (longLines.length > 0) {
      return {
        valid: false,
        reason: `Line too long (max ${this.maxLineLength} characters)`,
      };
    }

    // Check for null bytes and control characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input)) {
      return { valid: false, reason: "Input contains control characters" };
    }

    return { valid: true };
  }

  normalizeInput(input) {
    return input
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/\r/g, "\n") // Handle Mac line endings
      .replace(/\u00A0/g, " ") // Replace non-breaking spaces
      .replace(/[\u2000-\u206F]/g, " ") // Replace various Unicode spaces
      .trim();
  }

  analyzeThreat(input, patterns = this.dangerousPatterns) {
    const threats = [];
    let maxSeverity = "none";

    const severityLevels = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

    for (const patternDef of patterns) {
      const matches = input.match(patternDef.pattern);
      if (matches) {
        threats.push({
          pattern: patternDef.pattern.source,
          severity: patternDef.severity,
          description: patternDef.description,
          matches: matches,
          positions: this.findMatchPositions(input, patternDef.pattern),
        });

        if (severityLevels[patternDef.severity] > severityLevels[maxSeverity]) {
          maxSeverity = patternDef.severity;
        }
      }
    }

    // Check for suspicious keyword density
    const keywordDensity = this.calculateSuspiciousKeywordDensity(input);
    if (keywordDensity > 0.1) {
      // More than 10% suspicious keywords
      threats.push({
        pattern: "keyword_density",
        severity: "medium",
        description: "High density of suspicious keywords",
        density: keywordDensity,
      });

      if (severityLevels["medium"] > severityLevels[maxSeverity]) {
        maxSeverity = "medium";
      }
    }

    return {
      threats: threats,
      risk: maxSeverity,
      description:
        threats.length > 0 ? threats[0].description : "No threats detected",
    };
  }

  findMatchPositions(input, pattern) {
    const positions = [];
    let match;
    const globalPattern = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
    );

    while ((match = globalPattern.exec(input)) !== null) {
      positions.push({
        start: match.index,
        end: match.index + match[0].length,
        match: match[0],
      });
    }

    return positions;
  }

  calculateSuspiciousKeywordDensity(input) {
    const words = input.toLowerCase().split(/\s+/);
    const suspiciousCount = words.filter((word) =>
      this.suspiciousKeywords.some((keyword) => word.includes(keyword)),
    ).length;

    return words.length > 0 ? suspiciousCount / words.length : 0;
  }

  sanitizeHTML(input) {
    const options = {
      whiteList: this.allowedTags.reduce((acc, tag) => {
        acc[tag] = [];
        return acc;
      }, {}),
      stripIgnoreTag: true,
      stripIgnoreTagBody: ["script", "style"],
      allowCommentTag: false,
      stripBlankChar: true,
    };

    return xss(input, options);
  }

  sanitizeText(input) {
    return input
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }

  applyContentFilters(input, options) {
    let filtered = input;

    // Remove or replace dangerous patterns
    for (const patternDef of this.dangerousPatterns) {
      if (
        patternDef.severity === "high" ||
        patternDef.severity === "critical"
      ) {
        filtered = filtered.replace(patternDef.pattern, "[FILTERED]");
      }
    }

    // Filter URLs if not allowed
    if (!options.allowURLs) {
      filtered = filtered.replace(/https?:\/\/[^\s]+/g, "[URL_REMOVED]");
    }

    // Filter email addresses if not allowed
    if (!options.allowEmails) {
      filtered = filtered.replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        "[EMAIL_REMOVED]",
      );
    }

    // Filter phone numbers if not allowed
    if (!options.allowPhones) {
      filtered = filtered.replace(
        /\b\d{3}-\d{3}-\d{4}\b|\(\d{3}\)\s*\d{3}-\d{4}\b/g,
        "[PHONE_REMOVED]",
      );
    }

    return filtered;
  }

  preserveBasicFormatting(input) {
    return input
      .replace(/\n{3,}/g, "\n\n") // Limit consecutive line breaks
      .replace(/[ \t]{2,}/g, " "); // Normalize multiple spaces
  }

  normalizeWhitespace(input) {
    return input.replace(/\s+/g, " ").trim();
  }

  getModifications(original, sanitized) {
    const modifications = [];

    if (original.length !== sanitized.length) {
      modifications.push(
        `Length changed: ${original.length} -> ${sanitized.length}`,
      );
    }

    if (original !== sanitized) {
      modifications.push("Content sanitized");
    }

    return modifications;
  }

  validateBusinessInput(input, businessContext = {}) {
    const sanitizeResult = this.sanitize(input, {
      strictMode: true,
      allowHTML: false,
      preserveFormatting: true,
    });

    // Additional business-specific validation
    const businessValidation = this.validateBusinessContext(
      sanitizeResult.sanitized,
      businessContext,
    );

    return {
      ...sanitizeResult,
      businessValid: businessValidation.valid,
      businessReasons: businessValidation.reasons,
      readyForProcessing:
        sanitizeResult.riskLevel !== "critical" &&
        sanitizeResult.riskLevel !== "high" &&
        businessValidation.valid,
    };
  }

  validateBusinessContext(input, context) {
    const reasons = [];
    let valid = true;

    // Check for business-appropriate content
    if (
      context.requiresProfessional &&
      this.containsInappropriateContent(input)
    ) {
      valid = false;
      reasons.push("Content not appropriate for business context");
    }

    // Check for required business elements
    if (context.requiresSpecificTerms) {
      const hasRequiredTerms = context.requiresSpecificTerms.some((term) =>
        input.toLowerCase().includes(term.toLowerCase()),
      );
      if (!hasRequiredTerms) {
        valid = false;
        reasons.push("Missing required business terminology");
      }
    }

    // Check input relevance to business domain
    if (context.businessDomain) {
      const relevanceScore = this.calculateBusinessRelevance(
        input,
        context.businessDomain,
      );
      if (relevanceScore < 0.3) {
        valid = false;
        reasons.push("Input not relevant to business domain");
      }
    }

    return { valid, reasons };
  }

  containsInappropriateContent(input) {
    const inappropriatePatterns = [
      /\b(spam|phishing|scam)\b/gi,
      /\b(hack|exploit|malware)\b/gi,
      /\b(illegal|fraud|stolen)\b/gi,
    ];

    return inappropriatePatterns.some((pattern) => pattern.test(input));
  }

  calculateBusinessRelevance(input, domain) {
    const domainKeywords = {
      finance: [
        "payment",
        "transaction",
        "account",
        "balance",
        "invoice",
        "billing",
      ],
      healthcare: [
        "patient",
        "medical",
        "treatment",
        "diagnosis",
        "prescription",
      ],
      retail: ["order", "product", "customer", "inventory", "purchase", "sale"],
      technology: [
        "software",
        "system",
        "application",
        "database",
        "server",
        "api",
      ],
    };

    const keywords = domainKeywords[domain.toLowerCase()] || [];
    const inputWords = input.toLowerCase().split(/\s+/);
    const matchCount = inputWords.filter((word) =>
      keywords.some((keyword) => word.includes(keyword)),
    ).length;

    return inputWords.length > 0 ? matchCount / inputWords.length : 0;
  }

  createSanitizationReport(input, result) {
    return {
      timestamp: new Date().toISOString(),
      inputLength: input.length,
      outputLength: result.sanitized.length,
      riskLevel: result.riskLevel,
      threatsDetected: result.threats.length,
      threats: result.threats.map((threat) => ({
        type: threat.description,
        severity: threat.severity,
        pattern: threat.pattern,
      })),
      modifications: result.modificationsApplied,
      processingTime: 0, // Would be calculated in actual implementation
    };
  }

  batchSanitize(inputs, options = {}) {
    const results = [];
    const errors = [];

    for (let i = 0; i < inputs.length; i++) {
      try {
        const result = this.sanitize(inputs[i], options);
        results.push({
          index: i,
          success: true,
          result: result,
        });
      } catch (error) {
        errors.push({
          index: i,
          success: false,
          error: error.message,
          input: inputs[i].substring(0, 100) + "...",
        });
      }
    }

    return {
      results: results,
      errors: errors,
      totalProcessed: inputs.length,
      successCount: results.length,
      errorCount: errors.length,
    };
  }
}

module.exports = new PromptSanitizer();
