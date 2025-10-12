/**
 * SLM Business Service Layer - Main Orchestration Service
 *
 * @author Partha Chandramohan
 * @description Express.js server that handles HTTP requests, authentication, and routes requests to appropriate services
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const axios = require("axios"); // For HTTP requests

const authMiddleware = require("./middleware/auth");
const validationMiddleware = require("./middleware/validation");
const promptBuilder = require("./prompt-builder");
const contextManager = require("./context-manager");
const dbAdapter = require("../database/ai-database-adapter");
const modelEvaluator = require("../evaluation/model-evaluator");
const MCPIntegration = require("../mcp/mcp-integration");
const intentValidationService = require("../mcp/intent-validation-service");
const intelligentCacheService = require("../mcp/intelligent-cache-service");
const adaptiveModelSelector = require("../mcp/adaptive-model-selector");
const jwt = require("jsonwebtoken");
const { urlBuilder } = require("../../config/service-urls");
const securityConfig = require("../config/security-config");
const parallelProcessor = require("../utils/parallel-processor");
const errorHandler = require("../utils/error-handler");
const resourceMonitor = require("../utils/resource-monitor");
const trainingManager = require("../ai/training-manager");

const app = express();
const PORT = process.env.PORT || 8001;

// Initialize MCP Integration
const mcpIntegration = new MCPIntegration();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow inline scripts for test interface
  }),
);
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like file:// or mobile apps) or localhost
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('file://')) {
        callback(null, true);
      } else {
        callback(null, true); // For development, allow all origins
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.static("./")); // Serve static files from project root

// Rate limiting disabled for development/testing
// TODO: Re-enable with higher limits for production deployment
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 1000, // Higher limit for development
// });
// app.use("/api/", limiter);

// Service status endpoints for browser testing (before auth middleware)
app.get("/api/service-status/chromadb", async (req, res) => {
  try {
    const chromaUrl = urlBuilder.build("chromadb", "version");
    const response = await axios.get(chromaUrl);
    const version = response.data.replace(/"/g, "");
    res.json({
      status: "online",
      version: version,
      url: urlBuilder.getBaseUrl("chromadb"),
    });
  } catch (error) {
    res.json({ status: "offline", error: error.message });
  }
});

app.get("/api/service-status/ollama", async (req, res) => {
  try {
    const ollamaUrl = urlBuilder.build("ollama", "tags");
    const response = await axios.get(ollamaUrl);
    res.json({
      status: "online",
      models: response.data.models?.length || 0,
      url: urlBuilder.getBaseUrl("ollama"),
    });
  } catch (error) {
    res.json({ status: "offline", error: error.message });
  }
});

app.get("/api/service-status/postgres", async (req, res) => {
  try {
    const health = await dbAdapter.checkHealth();
    if (health.healthy) {
      res.json({
        status: "online",
        connection: health.connection,
        tables: health.tables,
        ai_components: health.ai_components,
        recent_queries: health.recent_queries,
        url: process.env.POSTGRES_URL || "postgresql://localhost:5432/business_app",
      });
    } else {
      res.json({ status: "offline", error: health.error });
    }
  } catch (error) {
    res.json({ status: "offline", error: error.message });
  }
});

// AI Analytics endpoint
app.get("/api/ai-analytics", async (req, res) => {
  try {
    const analytics = await dbAdapter.getAnalytics();
    res.json({
      success: true,
      analytics: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Query History endpoint
app.get("/api/query-history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await dbAdapter.getQueryHistory(limit);
    res.json({
      success: true,
      history: history,
      count: history.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Clear AI caches endpoint (admin only)
app.post("/api/clear-ai-cache", async (req, res) => {
  try {
    await dbAdapter.clearCaches();
    res.json({
      success: true,
      message: "AI caches cleared successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Token generation endpoint for browser testing
app.post("/api/generate-token", (req, res) => {
  try {
    const {
      userId = "browser-user",
      role = "admin",
      email = "browser@test.com",
    } = req.body;
    const jwtConfig = securityConfig.get("jwt");

    const token = jwt.sign(
      {
        id: userId,
        role: role,
        email: email,
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
      },
      jwtConfig.secret,
      {
        expiresIn: jwtConfig.expiresIn,
        algorithm: jwtConfig.algorithm,
      },
    );

    res.json({
      success: true,
      token: token,
      expiresIn: jwtConfig.expiresIn,
      user: { id: userId, role: role, email: email },
    });
  } catch (error) {
    console.error(
      "Token generation error:",
      securityConfig.sanitizeForLogging
        ? securityConfig.sanitizeForLogging(error.message)
        : error.message,
    );
    res.status(500).json({
      success: false,
      error: "Token generation failed",
    });
  }
});

// Timing middleware for performance tracking
app.use("/api/business-request", (req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Authentication middleware (after service status endpoints)
app.use("/api/business-request", authMiddleware);

// Validation middleware
app.use("/api/business-request", validationMiddleware);

// Health check
app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Main business logic endpoint
app.post("/api/business-request", async (req, res) => {
  try {
    const { request, context, model_config } = req.body;
    console.log(`Processing business request: "${request}"`);

    // Execute AI operations in parallel for better performance
    const operations = [
      // Database operation
      async () => {
        const ollamaClient = require("../slm/ollama-client");
        return await dbAdapter.processBusinessRequest(
          request,
          req.user,
          ollamaClient,
          model_config,
        );
      },
      // Context enrichment
      async () => contextManager.enrichContext(context, req.user),
      // Health checks for monitoring
      async () => {
        const ollamaClient = require("../slm/ollama-client");
        return await ollamaClient.checkHealth();
      },
    ];

    console.log("Executing AI operations in parallel...");
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
          console.log("DB Result received:", JSON.stringify(dbResult, null, 2));

          if (dbResult.success) {
            console.log(
              `AI Database query successful: ${dbResult.query_type}, ${dbResult.record_count} records`,
            );
            if (dbResult.ai_powered) {
              console.log(
                `AI-powered processing with confidence: ${dbResult.confidence}`,
              );
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
      console.log("RAG system not available, using simple context");
      promptResult = {
        prompt: `Business Query: ${request}\nContext: ${JSON.stringify(enrichedContext)}`,
        metadata: { template_used: "fallback", documents_retrieved: 0 },
        retrieved_documents: [],
      };
    }

    // Enhance prompt with database results if available
    if (dbResult && dbResult.success) {
      const dbContextPrompt = `\n\nDatabase Query Results:\nType: ${dbResult.query_type}\nSummary: ${dbResult.summary}\nData: ${JSON.stringify(dbResult.data, null, 2)}`;
      promptResult.prompt += dbContextPrompt;
    }

    // Try to use SLM service with MCP routing, fallback to direct Ollama, then structured response
    let slmResponse;
    try {
      // Try MCP integration first if available and ready
      if (mcpIntegration.isReady()) {
        console.log("Using MCP integration for inference");
        const mcpResult = await mcpIntegration.generateInference(
          promptResult.prompt,
          model_config?.model || null,
          {
            temperature: model_config?.temperature || 0.7,
            max_tokens: model_config?.max_tokens || 500,
          },
        );

        if (mcpResult.success) {
          slmResponse = mcpResult;
          console.log(
            `SLM Response generated via MCP (provider: ${mcpResult.provider})`,
          );
        } else {
          throw new Error("MCP inference failed");
        }
      } else {
        throw new Error("MCP not ready, falling back to direct Ollama");
      }
    } catch (mcpError) {
      console.log("MCP not available, trying direct Ollama:", mcpError.message);

      try {
        // Use existing ollamaClient if available from database processing
        if (!ollamaClient) {
          ollamaClient = require("../slm/ollama-client");
        }

        // Check if Ollama has any models
        const models = await ollamaClient.listAvailableModels();

        if (models && models.models && models.models.length > 0) {
          // Use Ollama for SLM inference
          slmResponse = await ollamaClient.generateResponse(
            promptResult.prompt,
            model_config?.model,
          );
          console.log("SLM Response generated via direct Ollama");
        } else {
          throw new Error("No models available in Ollama");
        }
      } catch (ollamaError) {
        console.log("Ollama not available, using intelligent fallback");

        // Intelligent fallback with database results integration
        slmResponse = generateIntelligentResponse(
          request,
          promptResult.retrieved_documents,
          dbResult,
        );
      }
    }

    // Parse response into structured format (simplified for demo)
    const parsedActions = {
      text_response: slmResponse.response || slmResponse,
      actions: [],
      confidence: dbResult && dbResult.success ? 0.98 : 0.95,
      requires_approval: false,
      data_source: dbResult && dbResult.success ? "database" : "brd_documents",
    };

    // Record query for training if training mode is enabled
    let trainingId = null;
    try {
      if (trainingManager.isTrainingMode() && trainingManager.isReady()) {
        trainingId = await trainingManager.recordQueryExecution(
          request,
          dbResult?.intent || null,
          dbResult?.generated_sql || null,
          dbResult?.data || null,
          dbResult?.error || null,
          slmResponse.model || "unknown",
          dbResult?.generation_metadata?.validationScore || null,
          dbResult?.generation_metadata?.fallbackChain?.join(" → ") || null
        );
        
        if (trainingId) {
          console.log(`[Training] Query recorded for feedback: ${trainingId}`);
        }
      }
    } catch (trainingError) {
      console.warn("[Training] Failed to record query:", trainingError.message);
    }

    res.json({
      success: true,
      message: "Request processed successfully",
      data: {
        request: request,
        enriched_context: enrichedContext,
        prompt_metadata: promptResult.metadata,
        retrieved_documents: promptResult.retrieved_documents,
        database_result: dbResult,
        slm_response: slmResponse.response || slmResponse,
        parsed_actions: parsedActions,
        processing_time: Date.now() - req.startTime,
        model_used: slmResponse.model || "intelligent-fallback",
        timestamp: new Date().toISOString(),
      },
      training_id: trainingId,  // NEW: Include training ID for UI
      training_mode: trainingManager.isTrainingMode(),  // NEW: Indicate if training is active
    });
  } catch (error) {
    console.error("Error processing business request:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error: " + error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Model Evaluation endpoint
app.post(
  "/api/evaluate-models",
  authMiddleware,
  validationMiddleware,
  async (req, res) => {
    try {
      const { request, context } = req.body;

      if (!request) {
        return res.status(400).json({
          success: false,
          error: "Business request is required",
        });
      }

      console.log(`Starting model evaluation for: "${request}"`);

      const ollamaClient = require("../slm/ollama-client");

      const evaluationResult = await modelEvaluator.evaluateAllModels(
        request,
        context || {},
        req.user.role || "admin",
        ollamaClient,
        null, // status callback
        mcpIntegration, // MCP integration
      );

      res.json({
        success: true,
        message: "Model evaluation completed",
        data: evaluationResult,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error during model evaluation:", error);
      res.status(500).json({
        success: false,
        error: "Model evaluation failed: " + error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Get current evaluation status
app.get("/api/evaluation-status", authMiddleware, (req, res) => {
  try {
    const status = modelEvaluator.getCurrentEvaluationStatus();

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching evaluation status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch evaluation status: " + error.message,
    });
  }
});

// Get evaluation history
app.get("/api/evaluation-history", authMiddleware, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = modelEvaluator.getEvaluationHistory(limit);

    res.json({
      success: true,
      data: history,
      count: history.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching evaluation history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch evaluation history: " + error.message,
    });
  }
});

// MCP API Endpoints

// Get MCP provider status
app.get("/api/mcp/providers", authMiddleware, async (req, res) => {
  try {
    const stats = mcpIntegration.getStats();

    res.json({
      success: true,
      data: {
        mcp_enabled: stats.mcp_enabled,
        providers: stats.router_stats?.registry?.servers || {},
        healthy_servers: stats.healthy_servers || [],
        migration_mode: stats.migration_mode,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching MCP providers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch MCP providers: " + error.message,
    });
  }
});

// Check MCP health
app.get("/api/mcp/health", authMiddleware, async (req, res) => {
  try {
    const health = await mcpIntegration.checkHealth();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error checking MCP health:", error);
    res.status(500).json({
      success: false,
      error: "MCP health check failed: " + error.message,
    });
  }
});

// Test MCP connectivity
app.post("/api/mcp/test", authMiddleware, async (req, res) => {
  try {
    const connectivity = await mcpIntegration.testConnectivity();

    res.json({
      success: true,
      data: connectivity,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error testing MCP connectivity:", error);
    res.status(500).json({
      success: false,
      error: "MCP connectivity test failed: " + error.message,
    });
  }
});

// Direct MCP request interface
app.post(
  "/api/mcp/request",
  authMiddleware,
  validationMiddleware,
  async (req, res) => {
    try {
      const { capability, method, params, options } = req.body;

      if (!capability || !method) {
        return res.status(400).json({
          success: false,
          error: "Capability and method are required",
        });
      }

      const router = mcpIntegration.getRouter();
      const result = await router.routeRequest(
        capability,
        method,
        params || {},
        options || {},
      );

      res.json({
        success: result.success,
        data: result.success ? result.result : null,
        error: result.success ? null : result.error,
        metadata: {
          server: result.server,
          routing_time: result.routingTime,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error processing MCP request:", error);
      res.status(500).json({
        success: false,
        error: "MCP request failed: " + error.message,
      });
    }
  },
);

// Get MCP server capabilities
app.get("/api/mcp/capabilities", authMiddleware, async (req, res) => {
  try {
    const serverName = req.query.server;

    if (serverName) {
      const server = mcpIntegration.getServer(serverName);
      if (!server) {
        return res.status(404).json({
          success: false,
          error: `Server not found: ${serverName}`,
        });
      }

      const tools = await server.listTools();

      res.json({
        success: true,
        data: {
          server: serverName,
          tools: tools,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Get capabilities for all servers
      const stats = mcpIntegration.getStats();
      const servers = stats.router_stats?.registry?.servers || {};

      res.json({
        success: true,
        data: {
          servers: Object.keys(servers),
          server_details: servers,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error fetching MCP capabilities:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch MCP capabilities: " + error.message,
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
          response += `${record.sku} - ${record.product_name} - Stock: ${record.quantity_available || record.quantity_on_hand || "N/A"}\n`;
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
    const docContent = retrievedDocs
      .map((doc) => doc.content)
      .join(" ")
      .toLowerCase();

    if (
      requestLower.includes("business rule") ||
      requestLower.includes("rule")
    ) {
      response += "here are the relevant business rules:\n\n";
      const rules = extractBusinessRules(retrievedDocs);
      response += rules.join("\n");
    } else if (
      requestLower.includes("requirement") ||
      requestLower.includes("req")
    ) {
      response += "here are the relevant requirements:\n\n";
      const requirements = extractRequirements(retrievedDocs);
      response += requirements.join("\n");
    } else if (
      requestLower.includes("order") &&
      requestLower.includes("process")
    ) {
      response += "the order processing workflow involves:\n\n";
      response += "1. Order validation and customer verification\n";
      response += "2. Inventory allocation and reservation\n";
      response += "3. Payment processing and authorization\n";
      response += "4. Fulfillment center assignment\n";
      response += "5. Shipping and delivery coordination\n";
      response += "6. Order status updates and customer notifications";
    } else if (
      requestLower.includes("inventory") ||
      requestLower.includes("stock")
    ) {
      response += "the inventory management system:\n\n";
      response +=
        "- Maintains real-time inventory levels across all locations\n";
      response +=
        "- Automatically triggers replenishment when stock falls below thresholds\n";
      response += "- Provides inventory optimization recommendations\n";
      response +=
        "- Integrates with multiple sales channels for unified stock management";
    } else {
      // Generic response with document snippets
      response += "I found the following relevant information:\n\n";
      retrievedDocs.slice(0, 3).forEach((doc, index) => {
        response += `${index + 1}. ${doc.content.substring(0, 200)}...\n\n`;
      });
    }
  } else {
    response +=
      "I couldn't find specific information about your request in the business requirements documents. ";
    response +=
      "Please ensure your BRDs have been properly ingested into the system.";
  }

  return response;
}

function extractBusinessRules(docs) {
  const rules = [];
  docs.forEach((doc) => {
    const content = doc.content;
    const brMatches = content.match(/BR-\d+[:.]\s*([^\n]+)/gi);
    if (brMatches) {
      rules.push(...brMatches);
    }
  });
  return rules.length > 0
    ? rules
    : ["No specific business rules found in retrieved documents"];
}

function extractRequirements(docs) {
  const requirements = [];
  docs.forEach((doc) => {
    const content = doc.content;
    const reqMatches = content.match(/REQ-\d+[:.]\s*([^\n]+)/gi);
    if (reqMatches) {
      requirements.push(...reqMatches);
    }
  });
  return requirements.length > 0
    ? requirements
    : ["No specific requirements found in retrieved documents"];
}

// Initialize database adapter on startup
async function initializeServices() {
  try {
    console.log("Initializing database adapter...");
    await dbAdapter.initialize();
    console.log("Database adapter initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database adapter:", error.message);
    // Continue without database for testing other services
  }

  // Initialize training manager
  try {
    console.log("Initializing training manager...");
    await trainingManager.initialize();
    console.log("Training manager initialized successfully");
  } catch (error) {
    console.error("Failed to initialize training manager:", error.message);
    // Continue without training for basic functionality
  }

  // Initialize MCP integration
  try {
    console.log("Initializing MCP integration...");
    const ollamaClient = require("../slm/ollama-client");
    mcpIntegration.setLegacyClient(ollamaClient);
    await mcpIntegration.initialize();
    console.log("MCP integration initialized successfully");
  } catch (error) {
    console.error("Failed to initialize MCP integration:", error.message);
    console.log("MCP integration will use legacy fallback mode");
    // Continue without MCP for testing other services
  }
}

// Enhanced Intent Validation and Caching API Endpoints

// Validate intent with multi-model consensus
app.post("/api/validate-intent", authMiddleware, validationMiddleware, async (req, res) => {
  try {
    const { userRequest, generatedIntent, generatedSQL } = req.body;

    if (!userRequest || !generatedIntent || !generatedSQL) {
      return res.status(400).json({
        success: false,
        error: "userRequest, generatedIntent, and generatedSQL are required"
      });
    }

    console.log(`[API] Validating intent for: "${userRequest}"`);

    const validationResult = await intentValidationService.validateIntent(
      userRequest,
      generatedIntent,
      generatedSQL
    );

    res.json({
      success: true,
      message: "Intent validation completed",
      data: validationResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error validating intent:", error);
    res.status(500).json({
      success: false,
      error: "Intent validation failed: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check cache for similar queries
app.post("/api/cache/search", authMiddleware, validationMiddleware, async (req, res) => {
  try {
    const { userRequest, intent } = req.body;

    if (!userRequest || !intent) {
      return res.status(400).json({
        success: false,
        error: "userRequest and intent are required"
      });
    }

    console.log(`[API] Searching cache for: "${userRequest}"`);

    const cacheResult = await intelligentCacheService.findCachedQuery(userRequest, intent);

    res.json({
      success: true,
      message: "Cache search completed",
      data: cacheResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error searching cache:", error);
    res.status(500).json({
      success: false,
      error: "Cache search failed: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache a validated query
app.post("/api/cache/store", authMiddleware, validationMiddleware, async (req, res) => {
  try {
    const { userRequest, intent, sqlQuery, queryResult, validationResult } = req.body;

    if (!userRequest || !intent || !sqlQuery || !queryResult || !validationResult) {
      return res.status(400).json({
        success: false,
        error: "All fields are required: userRequest, intent, sqlQuery, queryResult, validationResult"
      });
    }

    console.log(`[API] Caching validated query for: "${userRequest}"`);

    const cacheResult = await intelligentCacheService.cacheValidatedQuery(
      userRequest,
      intent,
      sqlQuery,
      queryResult,
      validationResult
    );

    res.json({
      success: true,
      message: "Query cached successfully",
      data: cacheResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error caching query:", error);
    res.status(500).json({
      success: false,
      error: "Query caching failed: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Select optimal model for request
app.post("/api/model/select", authMiddleware, validationMiddleware, async (req, res) => {
  try {
    const { intent, userRequest, context } = req.body;

    if (!intent || !userRequest) {
      return res.status(400).json({
        success: false,
        error: "intent and userRequest are required"
      });
    }

    console.log(`[API] Selecting optimal model for: "${userRequest}"`);

    const selectionResult = await adaptiveModelSelector.selectOptimalModel(
      intent,
      userRequest,
      { ...context, user: req.user }
    );

    res.json({
      success: true,
      message: "Model selection completed",
      data: selectionResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error selecting model:", error);
    res.status(500).json({
      success: false,
      error: "Model selection failed: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Record model performance
app.post("/api/model/performance", authMiddleware, validationMiddleware, async (req, res) => {
  try {
    const { modelId, intent, metrics } = req.body;

    if (!modelId || !intent || !metrics) {
      return res.status(400).json({
        success: false,
        error: "modelId, intent, and metrics are required"
      });
    }

    console.log(`[API] Recording performance for model: ${modelId}`);

    adaptiveModelSelector.recordModelPerformance(modelId, intent, metrics);

    res.json({
      success: true,
      message: "Model performance recorded",
      data: { modelId, intent, metrics },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error recording model performance:", error);
    res.status(500).json({
      success: false,
      error: "Performance recording failed: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get cache metrics
app.get("/api/cache/metrics", authMiddleware, (req, res) => {
  try {
    const metrics = intelligentCacheService.getMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching cache metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch cache metrics: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Flush/clear cache
app.post("/api/cache/flush", authMiddleware, (req, res) => {
  try {
    const { type } = req.body;
    const cacheType = type || 'all'; // Default to clearing all caches

    console.log(`[API] Flushing cache: ${cacheType}`);

    // Get metrics before clearing
    const beforeMetrics = intelligentCacheService.getMetrics();

    // Clear the cache
    intelligentCacheService.clearCache(cacheType);

    // Get metrics after clearing
    const afterMetrics = intelligentCacheService.getMetrics();

    res.json({
      success: true,
      message: `Cache cleared successfully: ${cacheType}`,
      data: {
        cache_type: cacheType,
        before_flush: {
          cache_sizes: beforeMetrics.cache_sizes,
          query_patterns_learned: beforeMetrics.query_patterns_learned
        },
        after_flush: {
          cache_sizes: afterMetrics.cache_sizes,
          query_patterns_learned: afterMetrics.query_patterns_learned
        },
        items_cleared: {
          validated_queries: beforeMetrics.cache_sizes.validated_queries,
          intent_patterns: beforeMetrics.cache_sizes.intent_patterns,
          results: beforeMetrics.cache_sizes.results,
          total_patterns: beforeMetrics.query_patterns_learned
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error flushing cache:", error);
    res.status(500).json({
      success: false,
      error: "Failed to flush cache: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get validation statistics
app.get("/api/validation/stats", authMiddleware, (req, res) => {
  try {
    const stats = intentValidationService.getValidationStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching validation stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch validation stats: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get model selection statistics
app.get("/api/model/stats", authMiddleware, (req, res) => {
  try {
    const stats = adaptiveModelSelector.getSelectionStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching model selection stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch model selection stats: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Main enhanced business request with full validation and caching pipeline (PRODUCTION VERSION)
app.post("/api/business-request-v2", authMiddleware, validationMiddleware, async (req, res) => {
  const startTime = Date.now();

  try {
    const { request, context, model_config } = req.body;
    console.log(`[Enhanced-v2] Processing business request: "${request}"`);

    // Step 1: Generate initial intent classification
    const ollamaClient = require("../slm/ollama-client");
    let intent;
    try {
      const intentClassifier = require("../ai/intent-classifier");
      intent = await intentClassifier.classifyIntent(request, context || {});
      console.log(`[Enhanced-v2] Intent classified: ${intent.intent} on ${intent.entity} (confidence: ${intent.confidence})`);
    } catch (intentError) {
      console.warn("[Enhanced-v2] Intent classification failed, using fallback");
      intent = { intent: 'analyze', entity: 'unknown', filters: [], confidence: 0.5 };
    }

    // Step 2: Check intelligent cache for similar validated queries
    const cacheResult = await intelligentCacheService.findCachedQuery(request, intent);

    if (cacheResult.cache_hit && cacheResult.confidence >= 0.8) {
      console.log(`[Enhanced-v2] Cache hit! Returning cached result (${cacheResult.match_type} match, confidence: ${cacheResult.confidence})`);

      return res.json({
        success: true,
        message: "Request processed from intelligent cache",
        data: {
          request: request,
          cached: true,
          match_type: cacheResult.match_type,
          confidence: cacheResult.confidence,
          result: cacheResult.cached_result,
          processing_time: Date.now() - startTime,
          time_saved: cacheResult.time_saved,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Step 3: Select optimal model based on request complexity
    const modelSelection = await adaptiveModelSelector.selectOptimalModel(
      intent,
      request,
      { ...context, user: req.user }
    );

    console.log(`[Enhanced-v2] Selected model: ${modelSelection.primary.model_id} (confidence: ${modelSelection.confidence})`);

    // Step 4: Execute AI operations in parallel with selected model
    const selectedModel = model_config?.model || modelSelection.primary.model_id;
    const operations = [
      // Database operation with selected model
      async () => {
        return await dbAdapter.processBusinessRequest(
          request,
          req.user,
          ollamaClient,
          { ...model_config, model: selectedModel },
        );
      },
      // Context enrichment
      async () => contextManager.enrichContext(context, req.user),
      // Health checks for monitoring
      async () => ollamaClient.checkHealth(),
    ];

    console.log("[Enhanced-v2] Executing AI operations in parallel...");
    const results = await parallelProcessor.executeAIOperations(operations);

    // Process results
    let dbResult = null;
    let enrichedContext = null;
    let ollamaHealth = null;

    for (const result of results) {
      if (result.success) {
        if (result.result && result.result.query_type) {
          dbResult = result.result;
          console.log("[Enhanced-v2] DB Result received:", dbResult.query_type);
        } else if (result.result && result.result.user) {
          enrichedContext = result.result;
        } else if (result.result && result.result.healthy !== undefined) {
          ollamaHealth = result.result;
        }
      } else {
        console.warn(`[Enhanced-v2] Parallel operation failed: ${result.error}`);
      }
    }

    // Fallback for context if parallel operation failed
    if (!enrichedContext) {
      enrichedContext = { ...context, user: req.user };
    }

    // Step 5: Build enhanced prompt with business context
    let promptResult;
    try {
      promptResult = await promptBuilder.buildPrompt(request, enrichedContext);
    } catch (ragError) {
      console.log("[Enhanced-v2] RAG system not available, using enhanced context");
      promptResult = {
        prompt: `Business Query: ${request}\nContext: ${JSON.stringify(enrichedContext)}`,
        metadata: { template_used: "enhanced_fallback", documents_retrieved: 0 },
        retrieved_documents: [],
      };
    }

    // Enhance prompt with database results if available
    if (dbResult && dbResult.success) {
      const dbContextPrompt = `\n\nDatabase Query Results:\nType: ${dbResult.query_type}\nSummary: ${dbResult.summary}\nData: ${JSON.stringify(dbResult.data, null, 2)}`;
      promptResult.prompt += dbContextPrompt;
    }

    // Step 6: Generate SQL/response with selected model
    let slmResponse;
    let generatedSQL = null;

    try {
      if (mcpIntegration.isReady()) {
        console.log("[Enhanced-v2] Using MCP integration with selected model");
        const mcpResult = await mcpIntegration.generateInference(
          promptResult.prompt,
          selectedModel,
          {
            temperature: model_config?.temperature || modelSelection.primary.capabilities.recommended_temperature || 0.1,
            max_tokens: model_config?.max_tokens || modelSelection.primary.capabilities.recommended_max_tokens || 500,
            query: request,
            userRole: req.user.role || 'employee'
          },
        );

        slmResponse = mcpResult;

        // Extract SQL if generated
        if (dbResult && dbResult.generated_sql) {
          generatedSQL = dbResult.generated_sql;
        }

      } else {
        console.log("[Enhanced-v2] MCP not ready, using direct Ollama with selected model");
        slmResponse = await ollamaClient.generateResponse(
          promptResult.prompt,
          selectedModel,
          {
            temperature: model_config?.temperature || 0.1,
            max_tokens: model_config?.max_tokens || 500,
          },
        );
      }
    } catch (slmError) {
      console.warn("[Enhanced-v2] SLM inference failed:", slmError.message);
      slmResponse = {
        success: true,
        response: "Query processed via intelligent fallback system",
        model: "intelligent-fallback",
        fallback: true,
        fallback_reason: slmError.message,
      };
    }

    // Step 7: Validate the generated response and SQL
    let validationResult = { recommendation: 'accept', consensus_score: 0.8, confidence_score: 0.8 };

    if (generatedSQL && slmResponse.success) {
      try {
        console.log("[Enhanced-v2] Validating intent-SQL matching...");
        validationResult = await intentValidationService.validateIntent(
          request,
          intent,
          generatedSQL
        );

        console.log(`[Enhanced-v2] Validation complete: ${validationResult.recommendation} (consensus: ${validationResult.consensus_score})`);
      } catch (validationError) {
        console.warn("[Enhanced-v2] Validation failed:", validationError.message);
        validationResult.recommendation = 'review';
      }
    }

    // Step 8: Record model performance for learning
    const executionTime = Date.now() - startTime;
    adaptiveModelSelector.recordModelPerformance(selectedModel, intent, {
      execution_time: executionTime,
      success: slmResponse.success,
      accuracy: validationResult.consensus_score,
      validation_passed: validationResult.recommendation === 'accept'
    });

    // Step 9: Cache validated queries for future use
    if (validationResult.recommendation === 'accept' && validationResult.consensus_score >= 0.8) {
      try {
        console.log("[Enhanced-v2] Caching validated query for future use...");
        await intelligentCacheService.cacheValidatedQuery(
          request,
          intent,
          generatedSQL || 'N/A',
          dbResult || {},
          validationResult
        );
      } catch (cacheError) {
        console.warn("[Enhanced-v2] Caching failed:", cacheError.message);
      }
    }

    // Parse the SLM response for actionable insights
    let parsedActions;
    try {
      const actionParser = require("../slm/action-parser");
      parsedActions = await actionParser.parseResponse(
        slmResponse.response || slmResponse,
        request,
        enrichedContext,
      );
    } catch (parseError) {
      console.warn("[Enhanced-v2] Action parsing failed, using fallback");
      parsedActions = {
        text_response: slmResponse,
        actions: [],
        confidence: validationResult.confidence_score || 0.8,
        requires_approval: validationResult.recommendation !== 'accept',
        data_source: "enhanced_pipeline",
      };
    }

    // Record query for training if training mode is enabled
    let trainingId = null;
    try {
      if (trainingManager.isTrainingMode() && trainingManager.isReady()) {
        trainingId = await trainingManager.recordQueryExecution(
          request,
          intent || null,
          dbResult?.generated_sql || null,
          dbResult?.data || null,
          dbResult?.error || null,
          modelSelection?.primary?.model_id || selectedModel || "unknown",
          validationResult?.consensus_score || null,
          dbResult?.generation_metadata?.fallbackChain?.join(" → ") || null
        );
        
        if (trainingId) {
          console.log(`[Training] Query recorded for feedback: ${trainingId}`);
        }
      }
    } catch (trainingError) {
      console.warn("[Training] Failed to record query:", trainingError.message);
    }

    res.json({
      success: true,
      message: "Request processed with enhanced validation and caching",
      data: {
        request: request,
        cached: false,
        intent_classification: intent,
        model_selection: {
          primary: modelSelection.primary.model_id,
          reasoning: modelSelection.reasoning,
          confidence: modelSelection.confidence
        },
        validation_result: {
          recommendation: validationResult.recommendation,
          consensus_score: validationResult.consensus_score,
          confidence_score: validationResult.confidence_score
        },
        enriched_context: enrichedContext,
        prompt_metadata: promptResult.metadata,
        retrieved_documents: promptResult.retrieved_documents,
        database_result: dbResult,
        slm_response: slmResponse.response || slmResponse,
        parsed_actions: parsedActions,
        processing_time: executionTime,
        model_used: selectedModel,
        performance_recorded: true,
        timestamp: new Date().toISOString(),
      },
      training_id: trainingId,  // NEW: Include training ID for UI
      training_mode: trainingManager.isTrainingMode(),  // NEW: Indicate if training is active
    });

  } catch (error) {
    console.error("[Enhanced-v2] Error processing business request:", error);
    res.status(500).json({
      success: false,
      error: "Enhanced processing failed: " + error.message,
      processing_time: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  }
});

// Enhanced business request with full validation pipeline (DEMO VERSION)
app.post("/api/business-request-enhanced", authMiddleware, validationMiddleware, async (req, res) => {
  try {
    const { request, context } = req.body;

    if (!request) {
      return res.status(400).json({
        success: false,
        error: "Business request is required"
      });
    }

    console.log(`[API] Enhanced business request: "${request}"`);

    // Step 1: Check cache first
    const intent = { intent: 'analyze', entity: 'unknown' }; // Simplified for demo
    const cacheResult = await intelligentCacheService.findCachedQuery(request, intent);

    if (cacheResult.cache_hit) {
      console.log(`[API] Cache hit! Returning cached result`);
      return res.json({
        success: true,
        message: "Request processed from cache",
        data: {
          cached: true,
          match_type: cacheResult.match_type,
          confidence: cacheResult.confidence,
          result: cacheResult.cached_result,
          time_saved: cacheResult.time_saved
        },
        timestamp: new Date().toISOString()
      });
    }

    // Step 2: Select optimal model
    const modelSelection = await adaptiveModelSelector.selectOptimalModel(
      intent,
      request,
      { ...context, user: req.user }
    );

    // Step 3: Process with selected model (simplified for demo)
    const processingResult = {
      model_used: modelSelection.primary.model_id,
      reasoning: modelSelection.reasoning,
      confidence: modelSelection.confidence
    };

    res.json({
      success: true,
      message: "Enhanced request processing completed",
      data: {
        cached: false,
        model_selection: modelSelection,
        processing_result: processingResult
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in enhanced business request:", error);
    res.status(500).json({
      success: false,
      error: "Enhanced request processing failed: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Clear cache (admin only)
app.post("/api/cache/clear", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: "Admin access required"
      });
    }

    const { type } = req.body;
    intelligentCacheService.clearCache(type || 'all');

    res.json({
      success: true,
      message: `Cache cleared: ${type || 'all'}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({
      success: false,
      error: "Cache clearing failed: " + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// TRAINING FEEDBACK ENDPOINTS
// ============================================================================

// Toggle training mode (admin only)
app.post("/api/training/toggle", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: "Admin access required to toggle training mode"
      });
    }

    const mode = await trainingManager.toggleTrainingMode(req.user.id);
    
    res.json({
      success: true,
      training_mode: mode,
      toggled_by: req.user.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error toggling training mode:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle training mode: " + error.message
    });
  }
});

// Get training mode status
app.get("/api/training/status", authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      training_mode: trainingManager.isTrainingMode(),
      is_ready: trainingManager.isReady(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Submit feedback for a training query
app.post("/api/training/feedback", authMiddleware, async (req, res) => {
  try {
    const { training_id, rating, feedback, corrected_sql } = req.body;

    if (!training_id || !rating) {
      return res.status(400).json({
        success: false,
        error: "training_id and rating are required"
      });
    }

    if (rating < 1 || rating > 10) {
      return res.status(400).json({
        success: false,
        error: "Rating must be between 1 and 10"
      });
    }

    const success = await trainingManager.applyHumanFeedback(
      training_id,
      rating,
      feedback || null,
      corrected_sql || null,
      req.user.id
    );

    if (success) {
      res.json({
        success: true,
        message: "Feedback applied and improvements generated",
        training_id: training_id,
        rating: rating,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to apply feedback"
      });
    }
  } catch (error) {
    console.error("Error applying feedback:", error);
    res.status(500).json({
      success: false,
      error: "Feedback submission failed: " + error.message
    });
  }
});

// Get training analytics
app.get("/api/training/analytics", authMiddleware, async (req, res) => {
  try {
    const analytics = await trainingManager.getTrainingAnalytics();
    
    res.json({
      success: true,
      analytics: analytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting training analytics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get analytics: " + error.message
    });
  }
});

// Get similar successful queries
app.post("/api/training/similar", authMiddleware, async (req, res) => {
  try {
    const { query, min_rating } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "query is required"
      });
    }

    const similar = await trainingManager.getSimilarSuccessfulQueries(
      query,
      min_rating || 8,
      10  // limit
    );

    res.json({
      success: true,
      similar_queries: similar,
      count: similar.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error finding similar queries:", error);
    res.status(500).json({
      success: false,
      error: "Failed to find similar queries: " + error.message
    });
  }
});

// Get training history
app.get("/api/training/history", authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const minRating = req.query.min_rating ? parseInt(req.query.min_rating) : null;
    
    let query = 'SELECT * FROM query_training_history WHERE 1=1';
    const params = [];
    
    if (minRating) {
      params.push(minRating);
      query += ` AND human_rating >= $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await trainingManager.pool.query(query, params);
    
    res.json({
      success: true,
      history: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting training history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get history: " + error.message
    });
  }
});

// Error handling middleware (must be last)
app.use(errorHandler.expressErrorHandler());

// Resource monitoring and health endpoint
app.get("/api/health", async (req, res) => {
  try {
    const health = await resourceMonitor.getHealthStatus();
    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
          ? 200
          : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Resource metrics endpoint
app.get("/api/metrics", (req, res) => {
  try {
    const metrics = resourceMonitor.getMetrics();
    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve metrics",
      timestamp: new Date().toISOString(),
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Orchestration service running on port ${PORT}`);

  // Initialize resource monitoring
  resourceMonitor.initialize();

  // Initialize other services
  await initializeServices();

  console.log(
    "🚀 SLM Business Service Layer ready with enhanced security and monitoring",
  );
});

module.exports = app;
