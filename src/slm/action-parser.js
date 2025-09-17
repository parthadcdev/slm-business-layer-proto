// Parse SLM responses into executable actions
class ActionParser {
  constructor() {
    this.actionTypes = {
      'database': ['query', 'insert', 'update', 'delete'],
      'api': ['get', 'post', 'put', 'patch', 'delete'],
      'business': ['validate', 'calculate', 'process', 'notify'],
      'workflow': ['start', 'continue', 'pause', 'complete', 'abort']
    };
  }

  parseActions(response) {
    try {
      let actions = [];

      if (response.actions && Array.isArray(response.actions)) {
        actions = response.actions.map(action => this.parseAction(action));
      } else if (typeof response === 'string') {
        actions = this.extractActionsFromText(response);
      }

      return actions.filter(action => action && action.type);
    } catch (error) {
      console.error('Error parsing actions:', error);
      return [];
    }
  }

  parseAction(actionText) {
    if (typeof actionText === 'object' && actionText.type) {
      return this.validateActionObject(actionText);
    }

    // Parse action from text
    const actionPattern = /^(database|api|business|workflow):\s*(\w+)\s*(?:\((.*?)\))?/i;
    const match = actionText.match(actionPattern);

    if (!match) {
      return this.parseNaturalLanguageAction(actionText);
    }

    const [, category, operation, params] = match;

    return {
      type: category.toLowerCase(),
      operation: operation.toLowerCase(),
      parameters: this.parseParameters(params),
      original: actionText,
      confidence: 0.9
    };
  }

  parseNaturalLanguageAction(text) {
    const lowercaseText = text.toLowerCase();

    // Database operations
    if (lowercaseText.includes('retrieve') || lowercaseText.includes('get') || lowercaseText.includes('find')) {
      return {
        type: 'database',
        operation: 'query',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.7
      };
    }

    if (lowercaseText.includes('create') || lowercaseText.includes('add') || lowercaseText.includes('insert')) {
      return {
        type: 'database',
        operation: 'insert',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.7
      };
    }

    if (lowercaseText.includes('update') || lowercaseText.includes('modify') || lowercaseText.includes('change')) {
      return {
        type: 'database',
        operation: 'update',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.7
      };
    }

    if (lowercaseText.includes('delete') || lowercaseText.includes('remove')) {
      return {
        type: 'database',
        operation: 'delete',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.7
      };
    }

    // API operations
    if (lowercaseText.includes('call') || lowercaseText.includes('request') || lowercaseText.includes('api')) {
      return {
        type: 'api',
        operation: 'post',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.6
      };
    }

    // Business operations
    if (lowercaseText.includes('calculate') || lowercaseText.includes('compute')) {
      return {
        type: 'business',
        operation: 'calculate',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.8
      };
    }

    if (lowercaseText.includes('validate') || lowercaseText.includes('verify') || lowercaseText.includes('check')) {
      return {
        type: 'business',
        operation: 'validate',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.8
      };
    }

    if (lowercaseText.includes('notify') || lowercaseText.includes('send') || lowercaseText.includes('alert')) {
      return {
        type: 'business',
        operation: 'notify',
        parameters: this.extractEntities(text),
        original: text,
        confidence: 0.7
      };
    }

    // Default fallback
    return {
      type: 'business',
      operation: 'process',
      parameters: { description: text },
      original: text,
      confidence: 0.3
    };
  }

  extractActionsFromText(text) {
    const lines = text.split('\n');
    const actions = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && (
        trimmed.match(/^\d+\./) ||
        trimmed.match(/^[-*•]/) ||
        trimmed.includes(':')
      )) {
        const action = this.parseAction(trimmed);
        if (action) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  validateActionObject(actionObj) {
    const validatedAction = {
      type: actionObj.type?.toLowerCase(),
      operation: actionObj.operation?.toLowerCase(),
      parameters: actionObj.parameters || {},
      original: actionObj.original || JSON.stringify(actionObj),
      confidence: actionObj.confidence || 0.8
    };

    // Validate type
    if (!Object.keys(this.actionTypes).includes(validatedAction.type)) {
      validatedAction.type = 'business';
      validatedAction.confidence *= 0.5;
    }

    // Validate operation
    if (!this.actionTypes[validatedAction.type].includes(validatedAction.operation)) {
      validatedAction.operation = 'process';
      validatedAction.confidence *= 0.7;
    }

    return validatedAction;
  }

  parseParameters(paramString) {
    if (!paramString) return {};

    try {
      // Try JSON parsing first
      if (paramString.trim().startsWith('{')) {
        return JSON.parse(paramString);
      }

      // Parse key-value pairs
      const params = {};
      const pairs = paramString.split(',');

      for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
          params[key] = value.replace(/['"]/g, '');
        }
      }

      return params;
    } catch (error) {
      return { raw: paramString };
    }
  }

  extractEntities(text) {
    const entities = {};

    // Extract common entities
    const patterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b\d{3}-\d{3}-\d{4}\b|\b\(\d{3}\)\s*\d{3}-\d{4}\b/g,
      date: /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g,
      number: /\b\d+(?:\.\d+)?\b/g,
      currency: /\$\d+(?:\.\d{2})?/g
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = text.match(pattern);
      if (matches) {
        entities[type] = matches;
      }
    }

    return entities;
  }

  getActionExecutionOrder(actions) {
    const priorities = {
      'business': { 'validate': 1, 'calculate': 2, 'process': 3, 'notify': 4 },
      'database': { 'query': 1, 'insert': 2, 'update': 3, 'delete': 4 },
      'api': { 'get': 1, 'post': 2, 'put': 3, 'patch': 4, 'delete': 5 },
      'workflow': { 'start': 1, 'continue': 2, 'pause': 3, 'complete': 4, 'abort': 5 }
    };

    return actions.sort((a, b) => {
      const aPriority = priorities[a.type]?.[a.operation] || 999;
      const bPriority = priorities[b.type]?.[b.operation] || 999;
      return aPriority - bPriority;
    });
  }
}

module.exports = new ActionParser();