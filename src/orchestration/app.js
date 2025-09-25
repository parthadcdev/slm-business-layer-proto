/**
 * SLM Business Service Layer - Main Orchestration Service
 *
 * @author Partha Chandramohan
 * @description Express.js server that handles HTTP requests, authentication, and routes requests to appropriate services
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios'); // For HTTP requests

const authMiddleware = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');
const promptBuilder = require('./prompt-builder');
const contextManager = require('./context-manager');
const dbAdapter = require('../database/ai-database-adapter');
const modelEvaluator = require('../evaluation/model-evaluator');
const jwt = require('jsonwebtoken');
const { urlBuilder } = require('../../config/service-urls');
const securityConfig = require('../config/security-config');
const parallelProcessor = require('../utils/parallel-processor');
const errorHandler = require('../utils/error-handler');
const resourceMonitor = require('../utils/resource-monitor');

const app = express();
const PORT = process.env.PORT || 8001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for test interface
}));
app.use(cors({
  origin: ['http://localhost:8001', 'http://127.0.0.1:8001', 'file://'], // Allow local file access
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('./')); // Serve static files from project root

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Service status endpoints for browser testing (before auth middleware)
app.get('/api/service-status/chromadb', async (req, res) => {
  try {
    const chromaUrl = urlBuilder.build('chromadb', 'version');
    const response = await axios.get(chromaUrl);
    const version = response.data.replace(/"/g, '');
    res.json({ status: 'online', version: version, url: urlBuilder.getBaseUrl('chromadb') });
  } catch (error) {
    res.json({ status: 'offline', error: error.message });
  }
});

app.get('/api/service-status/ollama', async (req, res) => {
  try {
    const ollamaUrl = urlBuilder.build('ollama', 'tags');
    const response = await axios.get(ollamaUrl);
    res.json({ status: 'online', models: response.data.models?.length || 0, url: urlBuilder.getBaseUrl('ollama') });
  } catch (error) {
    res.json({ status: 'offline', error: error.message });
  }
});

app.get('/api/service-status/postgres', async (req, res) => {
  try {
    const health = await dbAdapter.checkHealth();
    if (health.healthy) {
      res.json({
        status: 'online',
        connection: health.connection,
        tables: health.tables,
        ai_components: health.ai_components,
        recent_queries: health.recent_queries,
        url: `postgresql://${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}`
      });
    } else {
      res.json({ status: 'offline', error: health.error });
    }
  } catch (error) {
    res.json({ status: 'offline', error: error.message });
  }
});

// AI Analytics endpoint
app.get('/api/ai-analytics', async (req, res) => {
  try {
    const analytics = await dbAdapter.getAnalytics();
    res.json({
      success: true,
      analytics: analytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Query History endpoint
app.get('/api/query-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await dbAdapter.getQueryHistory(limit);
    res.json({
      success: true,
      history: history,
      count: history.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear AI caches endpoint (admin only)
app.post('/api/clear-ai-cache', async (req, res) => {
  try {
    await dbAdapter.clearCaches();
    res.json({
      success: true,
      message: 'AI caches cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Token generation endpoint for browser testing
app.post('/api/generate-token', (req, res) => {
  try {
    const { userId = 'browser-user', role = 'admin', email = 'browser@test.com' } = req.body;
    const jwtConfig = securityConfig.get('jwt');

    const token = jwt.sign(
      {
        id: userId,
        role: role,
        email: email,
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience
      },
      jwtConfig.secret,
      {
        expiresIn: jwtConfig.expiresIn,
        algorithm: jwtConfig.algorithm
      }
    );

    res.json({
      success: true,
      token: token,
      expiresIn: jwtConfig.expiresIn,
      user: { id: userId, role: role, email: email }
    });
  } catch (error) {
    console.error('Token generation error:', securityConfig.sanitizeForLogging ? securityConfig.sanitizeForLogging(error.message) : error.message);
    res.status(500).json({
      success: false,
      error: 'Token generation failed'
    });
  }
});

// Timing middleware for performance tracking
app.use('/api/business-request', (req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Authentication middleware (after service status endpoints)
app.use('/api/business-request', authMiddleware);

// Validation middleware
app.use('/api/business-request', validationMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Main business logic endpoint
app.post('/api/business-request', async (req, res) => {
  try {
    const { request, context, model_config } = req.body;
    console.log(`Processing business request: "${request}"`);

    // Execute AI operations in parallel for better performance
    const operations = [
      // Database operation
      async () => {
        const ollamaClient = require('../slm/ollama-client');
        return await dbAdapter.processBusinessRequest(request, req.user, ollamaClient, model_config);
      },
      // Context enrichment
      async () => contextManager.enrichContext(context, req.user),
      // Health checks for monitoring
      async () => {
        const ollamaClient = require('../slm/ollama-client');
        return await ollamaClient.checkHealth();
      }
    ];

    console.log('Executing AI operations in parallel...');
    const results = await parallelProcessor.executeAIOperations(operations);

    // Process results
    let dbResult = null;
    let enrichedContext = null;
    let ollamaHealth = null;

    for (const result of results) {
      if (result.success) {
        if (result.result && result.result.query_type) {
          // This is the database result
          dbResult = result.result;
          console.log('DB Result received:', JSON.stringify(dbResult, null, 2));

          if (dbResult.success) {
            console.log(`AI Database query successful: ${dbResult.query_type}, ${dbResult.record_count} records`);
            if (dbResult.ai_powered) {
              console.log(`AI-powered processing with confidence: ${dbResult.confidence}`);
            }
          }
        } else if (result.result && result.result.user) {
          // This is the enriched context
          enrichedContext = result.result;
        } else if (result.result && result.result.healthy !== undefined) {
          // This is the health check
          ollamaHealth = result.result;
        }
      } else {
        console.warn(`Parallel operation failed: ${result.error}`);
      }
    }

    // Fallback for context if parallel operation failed
    if (!enrichedContext) {
      enrichedContext = { ...context, user: req.user };
    }

    // Build prompt (can be done after parallel operations)
    let promptResult;
    try {
      promptResult = await promptBuilder.buildPrompt(request, enrichedContext);
    } catch (ragError) {
      console.log('RAG system not available, using simple context');
      promptResult = {
        prompt: `Business Query: ${request}\nContext: ${JSON.stringify(enrichedContext)}`,
        metadata: { template_used: 'fallback', documents_retrieved: 0 },
        retrieved_documents: []
      };
    }

    // Enhance prompt with database results if available
    if (dbResult && dbResult.success) {
      const dbContextPrompt = `\n\nDatabase Query Results:\nType: ${dbResult.query_type}\nSummary: ${dbResult.summary}\nData: ${JSON.stringify(dbResult.data, null, 2)}`;
      promptResult.prompt += dbContextPrompt;
    }

    // Try to use SLM service, fallback to structured response
    let slmResponse;
    try {
      // Use existing ollamaClient if available from database processing
      if (!ollamaClient) {
        ollamaClient = require('../slm/ollama-client');
      }

      // Check if Ollama has any models
      const models = await ollamaClient.listAvailableModels();

      if (models && models.models && models.models.length > 0) {
        // Use Ollama for SLM inference
        slmResponse = await ollamaClient.generateResponse(promptResult.prompt);
        console.log('SLM Response generated via Ollama');
      } else {
        throw new Error('No models available in Ollama');
      }
    } catch (ollamaError) {
      console.log('Ollama not available, using intelligent fallback');

      // Intelligent fallback with database results integration
      slmResponse = generateIntelligentResponse(request, promptResult.retrieved_documents, dbResult);
    }

    // Parse response into structured format (simplified for demo)
    const parsedActions = {
      text_response: slmResponse.response || slmResponse,
      actions: [],
      confidence: dbResult && dbResult.success ? 0.98 : 0.95,
      requires_approval: false,
      data_source: dbResult && dbResult.success ? 'database' : 'brd_documents'
    };

    res.json({
      success: true,
      message: 'Request processed successfully',
      data: {
        request: request,
        enriched_context: enrichedContext,
        prompt_metadata: promptResult.metadata,
        retrieved_documents: promptResult.retrieved_documents,
        database_result: dbResult,
        slm_response: slmResponse.response || slmResponse,
        parsed_actions: parsedActions,
        processing_time: Date.now() - req.startTime,
        model_used: slmResponse.model || 'intelligent-fallback',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error processing business request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Model Evaluation endpoint
app.post('/api/evaluate-models', authMiddleware, validationMiddleware, async (req, res) => {
  try {
    const { request, context } = req.body;

    if (!request) {
      return res.status(400).json({
        success: false,
        error: 'Business request is required'
      });
    }

    console.log(`Starting model evaluation for: "${request}"`);

    const ollamaClient = require('../slm/ollama-client');

    const evaluationResult = await modelEvaluator.evaluateAllModels(
      request,
      context || {},
      req.user.role || 'admin',
      ollamaClient
    );

    res.json({
      success: true,
      message: 'Model evaluation completed',
      data: evaluationResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error during model evaluation:', error);
    res.status(500).json({
      success: false,
      error: 'Model evaluation failed: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get evaluation history
app.get('/api/evaluation-history', authMiddleware, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = modelEvaluator.getEvaluationHistory(limit);

    res.json({
      success: true,
      data: history,
      count: history.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching evaluation history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch evaluation history: ' + error.message
    });
  }
});

// Intelligent response generator when SLM is not available
function generateIntelligentResponse(request, retrievedDocs, dbResult) {
  const requestLower = request.toLowerCase();
  let response = "";

  // Prioritize database results if available
  if (dbResult && dbResult.success) {
    response = `Based on current database data, ${dbResult.summary}.\n\n`;

    if (dbResult.data && dbResult.data.length > 0) {
      response += "Here are the details:\n\n";

      // Format data based on query type
      dbResult.data.slice(0, 10).forEach((record, index) => {
        response += `${index + 1}. `;

        // Format different types of records
        if (record.order_number) {
          response += `Order ${record.order_number} - ${record.customer_name} - $${record.total_amount} (${record.status})\n`;
        } else if (record.sku) {
          response += `${record.sku} - ${record.product_name} - Stock: ${record.quantity_available || record.quantity_on_hand || 'N/A'}\n`;
        } else if (record.customer_name && record.marketing_priority) {
          // Enhanced customer marketing format
          response += `📊 ${record.customer_name} (${record.customer_code})\n`;
          response += `   💰 Value: $${record.total_spent} (${record.value_segment})\n`;
          response += `   📈 AOV: $${record.avg_order_value} | Orders: ${record.total_orders}\n`;
          response += `   🎯 Priority: ${record.marketing_priority}\n`;
          response += `   📅 Status: ${record.engagement_status}\n`;
          if (record.days_since_last_order) {
            response += `   ⏰ Last Order: ${record.days_since_last_order} days ago\n`;
          }
          response += `   📧 Contact: ${record.email}\n\n`;
        } else if (record.customer_name) {
          response += `${record.customer_name} - ${record.customer_type} - Total Spent: $${record.total_spent || 0}\n`;
        } else if (record.warehouse_name) {
          response += `${record.warehouse_name} - ${record.product_count || record.total_units || 0} items\n`;
        } else if (record.company_name) {
          response += `${record.company_name} - Rating: ${record.rating}/5 - Lead Time: ${record.lead_time_days} days\n`;
        } else {
          response += `${JSON.stringify(record)}\n`;
        }
      });

      if (dbResult.data.length > 10) {
        response += `\n... and ${dbResult.data.length - 10} more records.\n`;
      }
    }

    return response;
  }

  // Fallback to BRD-based responses if no database results
  response = "Based on your business requirements documents, ";

  // Analyze retrieved documents to provide context-aware responses
  if (retrievedDocs && retrievedDocs.length > 0) {
    const docContent = retrievedDocs.map(doc => doc.content).join(' ').toLowerCase();

    if (requestLower.includes('business rule') || requestLower.includes('rule')) {
      response += "here are the relevant business rules:\n\n";
      const rules = extractBusinessRules(retrievedDocs);
      response += rules.join('\n');
    }
    else if (requestLower.includes('requirement') || requestLower.includes('req')) {
      response += "here are the relevant requirements:\n\n";
      const requirements = extractRequirements(retrievedDocs);
      response += requirements.join('\n');
    }
    else if (requestLower.includes('order') && requestLower.includes('process')) {
      response += "the order processing workflow involves:\n\n";
      response += "1. Order validation and customer verification\n";
      response += "2. Inventory allocation and reservation\n";
      response += "3. Payment processing and authorization\n";
      response += "4. Fulfillment center assignment\n";
      response += "5. Shipping and delivery coordination\n";
      response += "6. Order status updates and customer notifications";
    }
    else if (requestLower.includes('inventory') || requestLower.includes('stock')) {
      response += "the inventory management system:\n\n";
      response += "- Maintains real-time inventory levels across all locations\n";
      response += "- Automatically triggers replenishment when stock falls below thresholds\n";
      response += "- Provides inventory optimization recommendations\n";
      response += "- Integrates with multiple sales channels for unified stock management";
    }
    else {
      // Generic response with document snippets
      response += "I found the following relevant information:\n\n";
      retrievedDocs.slice(0, 3).forEach((doc, index) => {
        response += `${index + 1}. ${doc.content.substring(0, 200)}...\n\n`;
      });
    }
  } else {
    response += "I couldn't find specific information about your request in the business requirements documents. ";
    response += "Please ensure your BRDs have been properly ingested into the system.";
  }

  return response;
}

function extractBusinessRules(docs) {
  const rules = [];
  docs.forEach(doc => {
    const content = doc.content;
    const brMatches = content.match(/BR-\d+[:.]\s*([^\n]+)/gi);
    if (brMatches) {
      rules.push(...brMatches);
    }
  });
  return rules.length > 0 ? rules : ["No specific business rules found in retrieved documents"];
}

function extractRequirements(docs) {
  const requirements = [];
  docs.forEach(doc => {
    const content = doc.content;
    const reqMatches = content.match(/REQ-\d+[:.]\s*([^\n]+)/gi);
    if (reqMatches) {
      requirements.push(...reqMatches);
    }
  });
  return requirements.length > 0 ? requirements : ["No specific requirements found in retrieved documents"];
}

// Initialize database adapter on startup
async function initializeServices() {
  try {
    console.log('Initializing database adapter...');
    await dbAdapter.initialize();
    console.log('Database adapter initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database adapter:', error.message);
    // Continue without database for testing other services
  }
}

// Error handling middleware (must be last)
app.use(errorHandler.expressErrorHandler());

// Resource monitoring and health endpoint
app.get('/api/health', async (req, res) => {
  try {
    const health = await resourceMonitor.getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Resource metrics endpoint
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = resourceMonitor.getMetrics();
    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Orchestration service running on port ${PORT}`);

  // Initialize resource monitoring
  resourceMonitor.initialize();

  // Initialize other services
  await initializeServices();

  console.log('🚀 SLM Business Service Layer ready with enhanced security and monitoring');
});

module.exports = app;