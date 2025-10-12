#!/usr/bin/env node
/**
 * Show the actual prompts sent to the LM for query processing
 */

// Set required environment variables
process.env.JWT_SECRET = "test-jwt-secret-for-development-only-minimum-32-chars-long";
process.env.NODE_ENV = "development";

const intentClassifier = require('./src/ai/intent-classifier');
const sqlGenerator = require('./src/ai/sql-generator');

function printSection(title, content, color = '36') {
  console.log(`\n\x1b[${color}m${'='.repeat(80)}\x1b[0m`);
  console.log(`\x1b[${color}m${title}\x1b[0m`);
  console.log(`\x1b[${color}m${'='.repeat(80)}\x1b[0m`);
  console.log(content);
}

async function showPrompts() {
  const userQuery = "Who is the most valuable customer?";
  
  console.log('\n\x1b[1;34m╔═══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1;34m║           LANGUAGE MODEL PROMPT ANALYSIS                                      ║\x1b[0m');
  console.log('\x1b[1;34m║           Query: "Who is the most valuable customer?"                         ║\x1b[0m');
  console.log('\x1b[1;34m╚═══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');

  try {
    // ==========================================================================
    // STEP 1: Intent Classification Prompt
    // ==========================================================================
    
    printSection(
      '📋 STEP 1: INTENT CLASSIFICATION PROMPT',
      'This prompt is sent to analyze the user\'s query and extract structured intent:',
      '36'
    );

    const intentPrompt = intentClassifier.buildIntentClassificationPrompt(userQuery);
    console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
    console.log(intentPrompt);
    console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
    
    console.log('\n\x1b[33m💡 Expected Response Format:\x1b[0m');
    console.log(JSON.stringify({
      intent: "analyze",
      entity: "customers",
      secondary_entities: ["orders"],
      filters: [],
      business_logic: "rank customers by total purchase value",
      sort_field: "total_spent",
      sort_direction: "DESC",
      limit: 1,
      time_scope: "lifetime",
      confidence: 0.95,
      query_complexity: "moderate",
      requires_joins: true,
      business_context: "customer value analysis"
    }, null, 2));

    // ==========================================================================
    // STEP 2: SQL Generation Prompt
    // ==========================================================================
    
    printSection(
      '🔨 STEP 2: SQL GENERATION PROMPT',
      'After intent is classified, this prompt generates the actual SQL query:',
      '35'
    );

    // Create a sample intent object
    const sampleIntent = {
      intent: "analyze",
      entity: "customers",
      secondary_entities: ["orders"],
      filters: [],
      business_logic: "rank customers by total purchase value to identify most valuable customer",
      sort_field: "total_spent",
      sort_direction: "DESC",
      limit: 1,
      time_scope: "lifetime",
      confidence: 0.95,
      query_complexity: "moderate",
      requires_joins: true,
      business_context: "customer value analysis - identify top spending customer",
      originalRequest: userQuery
    };

    const sqlPrompt = sqlGenerator.buildSQLGenerationPrompt(sampleIntent);
    console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
    console.log(sqlPrompt);
    console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');

    console.log('\n\x1b[33m💡 Expected SQL Response:\x1b[0m');
    console.log(`SELECT 
  customer_code,
  CONCAT(first_name, ' ', last_name) as customer_name,
  customer_type,
  loyalty_tier,
  total_orders,
  total_spent,
  ROUND((total_spent / NULLIF(total_orders, 0))::numeric, 2) as avg_order_value,
  CASE 
    WHEN total_spent > (SELECT AVG(total_spent) * 2 FROM customers) THEN 'High Value'
    WHEN total_spent > (SELECT AVG(total_spent) FROM customers) THEN 'Medium Value'
    ELSE 'Standard Value'
  END as value_tier
FROM customers 
WHERE status = 'active'
ORDER BY total_spent DESC 
LIMIT 1;`);

    // ==========================================================================
    // PROMPT CHARACTERISTICS
    // ==========================================================================
    
    printSection(
      '📊 PROMPT CHARACTERISTICS',
      '',
      '32'
    );

    console.log('Intent Classification Prompt:');
    console.log(`  • Length: ${intentPrompt.length} characters`);
    console.log(`  • Lines: ${intentPrompt.split('\n').length}`);
    console.log(`  • Contains: Business context, entity definitions, examples`);
    console.log(`  • Output: Structured JSON intent object\n`);

    console.log('SQL Generation Prompt:');
    console.log(`  • Length: ${sqlPrompt.length} characters`);
    console.log(`  • Lines: ${sqlPrompt.split('\n').length}`);
    console.log(`  • Contains: Schema details, business rules, BRD context, examples`);
    console.log(`  • Output: PostgreSQL SELECT query only\n`);

    // ==========================================================================
    // MODEL SELECTION INFO
    // ==========================================================================
    
    printSection(
      '🎯 MODEL SELECTION & ROUTING',
      '',
      '34'
    );

    const modelManager = require('./src/slm/model-manager');
    await modelManager.initialize();
    
    const status = modelManager.getStatus();
    console.log('Current System Configuration:');
    console.log(`  • Default Model: ${status.currentModel}`);
    console.log(`  • Available Models: ${status.availableModels.join(', ')}`);
    console.log(`  • Preferred for Business Queries: ${modelManager.getBestModelForTask('business')}`);
    console.log(`  • Temperature: ${status.currentConfig.temperature}`);
    console.log(`  • Max Tokens: ${status.currentConfig.maxTokens}`);
    console.log(`  • Context Window: ${status.currentConfig.contextWindow}`);

    console.log('\n\x1b[1;32m✅ Prompt analysis complete!\x1b[0m\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

showPrompts();

