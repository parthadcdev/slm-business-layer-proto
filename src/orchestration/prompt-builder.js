/**
 * SLM Business Service Layer - Prompt Builder
 *
 * @author Partha Chandramohan
 * @description Dynamic prompt construction for SLM inference with context-aware document retrieval
 */
const ragService = require('../rag/vector-store');

class PromptBuilder {
  constructor() {
    this.systemPrompt = `You are a business logic assistant that generates executable actions based on business requirements and user requests.

IMPORTANT GUIDELINES:
1. Only generate actions that are explicitly defined in the business requirements
2. Always validate requests against available operations
3. Provide clear, structured responses in JSON format
4. If a request cannot be fulfilled, explain why and suggest alternatives`;
  }

  async buildPrompt(userRequest, context) {
    try {
      // Retrieve relevant business requirements from RAG
      const relevantBRDs = await ragService.retrieveRelevant(userRequest, context);

      // Build context section
      const contextSection = this.buildContextSection(context);

      // Build BRD section
      const brdSection = this.buildBRDSection(relevantBRDs);

      // Build user request section
      const requestSection = this.buildRequestSection(userRequest);

      const fullPrompt = `${this.systemPrompt}

${contextSection}

${brdSection}

${requestSection}

Please provide a structured response with:
1. Analysis of the request
2. Applicable business rules
3. Recommended actions (if any)
4. Required parameters
5. Risk assessment`;

      return fullPrompt;
    } catch (error) {
      console.error('Error building prompt:', error);
      throw new Error('Failed to construct prompt');
    }
  }

  buildContextSection(context) {
    return `CONTEXT:
- User Role: ${context.userRole || 'Unknown'}
- Session ID: ${context.sessionId || 'Unknown'}
- Timestamp: ${new Date().toISOString()}
- Request Origin: ${context.origin || 'Unknown'}`;
  }

  buildBRDSection(brds) {
    if (!brds || brds.length === 0) {
      return 'BUSINESS REQUIREMENTS: No relevant requirements found.';
    }

    const brdText = brds.map((brd, index) =>
      `${index + 1}. ${brd.content}`
    ).join('\n');

    return `RELEVANT BUSINESS REQUIREMENTS:
${brdText}`;
  }

  buildRequestSection(request) {
    return `USER REQUEST:
${request}`;
  }
}

module.exports = new PromptBuilder();