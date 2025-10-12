/**
 * SLM Business Service Layer - Database Schema Ingestion Service
 *
 * @author Partha Chandramohan
 * @description Converts database schema into semantic chunks for RAG storage
 */
const fs = require("fs").promises;
const path = require("path");
const { ChromaClient, DefaultEmbeddingFunction } = require("chromadb");

class SchemaIngestor {
  constructor() {
    this.schemaPath = path.join(__dirname, "../../database/schema.sql");
    this.collectionName = "database_schema";
    this.client = null;
    this.embeddingFunction = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize ChromaDB client
      this.client = new ChromaClient({
        path: process.env.CHROMADB_URL || "http://localhost:8000",
      });

      // Initialize embedding function for consistent embeddings
      this.embeddingFunction = new DefaultEmbeddingFunction();

      // Test connection to ChromaDB
      await this.testConnection();

      this.initialized = true;
      console.log("Schema Ingestor initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Schema Ingestor:", error);
      throw new Error("Schema Ingestor initialization failed");
    }
  }

  /**
   * Test ChromaDB connection and API compatibility
   */
  async testConnection() {
    try {
      // Test basic ChromaDB connectivity
      const testCollectionName = "schema_test_" + Date.now();

      // Create a temporary test collection
      const collectionConfig = {
        name: testCollectionName,
        metadata: { description: "Connection test collection" },
      };

      // Always add embeddingFunction for consistent embeddings
      collectionConfig.embeddingFunction = this.embeddingFunction;

      const testCollection =
        await this.client.getOrCreateCollection(collectionConfig);

      // Clean up test collection
      await this.client.deleteCollection({ name: testCollectionName });

      console.log("ChromaDB connection test successful");
    } catch (error) {
      console.warn("ChromaDB connection test failed:", error.message);
      throw new Error(`ChromaDB connectivity issue: ${error.message}`);
    }
  }

  /**
   * Main entry point to ingest database schema into ChromaDB
   */
  async ingestDatabaseSchema() {
    await this.initialize();

    try {
      console.log("Starting database schema ingestion...");

      // 1. Parse SQL schema file
      const schemaContent = await this.parseSchemaFile();

      // 2. Convert to semantic documents
      const schemaDocuments = await this.createSemanticDocuments(schemaContent);

      // 3. Add RBAC and business context
      const enrichedDocuments =
        await this.enrichWithBusinessContext(schemaDocuments);

      // 4. Generate embeddings and store in ChromaDB
      await this.storeInVectorDatabase(enrichedDocuments);

      console.log(
        `Successfully ingested ${enrichedDocuments.length} schema documents`,
      );
      return {
        success: true,
        documentsIngested: enrichedDocuments.length,
        collections: ["database_schema"],
      };
    } catch (error) {
      console.error("Schema ingestion failed:", error);
      throw new Error(`Schema ingestion failed: ${error.message}`);
    }
  }

  /**
   * Parse the SQL schema file and extract table definitions
   */
  async parseSchemaFile() {
    try {
      const schemaContent = await fs.readFile(this.schemaPath, "utf8");

      // Extract CREATE TABLE statements
      const tableMatches = schemaContent.match(
        /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi,
      );

      if (!tableMatches) {
        throw new Error("No CREATE TABLE statements found in schema");
      }

      const tables = [];

      for (const tableMatch of tableMatches) {
        const table = this.parseTableDefinition(tableMatch);
        if (table) {
          tables.push(table);
        }
      }

      console.log(`Parsed ${tables.length} tables from schema`);
      return tables;
    } catch (error) {
      throw new Error(`Failed to parse schema file: ${error.message}`);
    }
  }

  /**
   * Parse individual table definition
   */
  parseTableDefinition(tableSQL) {
    try {
      // Extract table name
      const tableNameMatch = tableSQL.match(/CREATE TABLE\s+(\w+)/i);
      if (!tableNameMatch) return null;

      const tableName = tableNameMatch[1];

      // Extract columns
      const columnsSection = tableSQL.match(/\(([\s\S]*?)\)/)[1];
      const columnLines = columnsSection.split(",").map((line) => line.trim());

      const columns = [];
      const constraints = [];

      for (const line of columnLines) {
        if (
          line.includes("PRIMARY KEY") ||
          line.includes("FOREIGN KEY") ||
          line.includes("UNIQUE") ||
          line.includes("CHECK")
        ) {
          constraints.push(line);
        } else if (line && !line.startsWith("--")) {
          const column = this.parseColumnDefinition(line);
          if (column) {
            columns.push(column);
          }
        }
      }

      return {
        name: tableName,
        columns: columns,
        constraints: constraints,
        rawSQL: tableSQL,
      };
    } catch (error) {
      console.warn(`Failed to parse table definition: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse individual column definition
   */
  parseColumnDefinition(columnLine) {
    try {
      const parts = columnLine.trim().split(/\s+/);
      if (parts.length < 2) return null;

      const columnName = parts[0];
      const dataType = parts[1];

      // Extract constraints and defaults
      const constraints = [];
      const upperLine = columnLine.toUpperCase();

      if (upperLine.includes("NOT NULL")) constraints.push("NOT NULL");
      if (upperLine.includes("UNIQUE")) constraints.push("UNIQUE");
      if (upperLine.includes("PRIMARY KEY")) constraints.push("PRIMARY KEY");

      // Extract default value
      const defaultMatch = columnLine.match(/DEFAULT\s+([^,\s]+)/i);
      const defaultValue = defaultMatch ? defaultMatch[1] : null;

      return {
        name: columnName,
        type: dataType,
        constraints: constraints,
        default: defaultValue,
        rawDefinition: columnLine.trim(),
      };
    } catch (error) {
      console.warn(`Failed to parse column definition: ${error.message}`);
      return null;
    }
  }

  /**
   * Convert parsed schema into semantic documents
   */
  async createSemanticDocuments(tables) {
    const documents = [];

    for (const table of tables) {
      // Create table-level document
      const tableDoc = {
        id: `table_${table.name}`,
        type: "table",
        table_name: table.name,
        content: this.createTableDescription(table),
        metadata: {
          table: table.name,
          type: "table_overview",
          columns: table.columns.map((col) => col.name),
          primary_keys: table.columns
            .filter((col) => col.constraints.includes("PRIMARY KEY"))
            .map((col) => col.name),
          created_at: new Date().toISOString(),
        },
      };
      documents.push(tableDoc);

      // Create column-level documents
      for (const column of table.columns) {
        const columnDoc = {
          id: `column_${table.name}_${column.name}`,
          type: "column",
          table_name: table.name,
          column_name: column.name,
          content: this.createColumnDescription(table.name, column),
          metadata: {
            table: table.name,
            column: column.name,
            type: "column_detail",
            data_type: column.type,
            constraints: column.constraints,
            created_at: new Date().toISOString(),
          },
        };
        documents.push(columnDoc);
      }
    }

    return documents;
  }

  /**
   * Create human-readable table description
   */
  createTableDescription(table) {
    const columnList = table.columns
      .map((col) => `${col.name} (${col.type})`)
      .join(", ");

    return `Table: ${table.name}
Description: Database table containing ${this.getTableBusinessContext(table.name)}
Columns: ${columnList}
Purpose: ${this.getTablePurpose(table.name)}
Common queries: ${this.getCommonQueries(table.name)}`;
  }

  /**
   * Create human-readable column description
   */
  createColumnDescription(tableName, column) {
    return `Column: ${column.name} in table ${tableName}
Data Type: ${column.type}
Constraints: ${column.constraints.join(", ") || "None"}
Business Meaning: ${this.getColumnBusinessMeaning(tableName, column.name)}
Usage: ${this.getColumnUsage(tableName, column.name)}`;
  }

  /**
   * Get business context for tables
   */
  getTableBusinessContext(tableName) {
    const contexts = {
      customers:
        "customer profiles, contact information, spending history, and loyalty data",
      orders:
        "customer orders with status tracking, dates, amounts, and priority levels",
      products:
        "product catalog with categories, suppliers, pricing, and inventory settings",
      inventory:
        "stock levels, locations, reservations across multiple warehouses",
      suppliers:
        "vendor information, performance ratings, delivery metrics, and quality scores",
      warehouses:
        "storage facilities with capacity, location, and management details",
      categories: "product categorization and hierarchy for organization",
      order_items:
        "individual line items within orders with quantities and pricing",
    };
    return contexts[tableName] || "business data records";
  }

  /**
   * Get table purpose for business operations
   */
  getTablePurpose(tableName) {
    const purposes = {
      customers:
        "Customer relationship management, segmentation, loyalty tracking",
      orders: "Order management, fulfillment tracking, revenue analysis",
      products: "Catalog management, pricing strategy, supplier relationships",
      inventory:
        "Stock control, warehouse management, supply chain optimization",
      suppliers:
        "Vendor management, performance monitoring, sourcing decisions",
      warehouses:
        "Facility management, capacity planning, logistics coordination",
      categories:
        "Product organization, reporting structure, navigation hierarchy",
      order_items:
        "Detailed order analysis, product performance, pricing verification",
    };
    return purposes[tableName] || "Data storage and retrieval";
  }

  /**
   * Get common business queries for tables
   */
  getCommonQueries(tableName) {
    const queries = {
      customers:
        "top spenders, customer segments, loyalty analysis, contact lookup",
      orders: "pending orders, order history, revenue reports, status tracking",
      products:
        "product catalog, price lists, supplier products, category browsing",
      inventory:
        "stock levels, low stock alerts, warehouse distribution, availability",
      suppliers: "supplier performance, delivery tracking, vendor comparison",
      warehouses: "capacity utilization, location lookup, operational metrics",
      categories: "category hierarchy, product organization, classification",
      order_items:
        "order details, product sales analysis, pricing verification",
    };
    return queries[tableName] || "standard data queries";
  }

  /**
   * Get business meaning for columns
   */
  getColumnBusinessMeaning(tableName, columnName) {
    const meanings = {
      customers: {
        total_spent:
          "Lifetime customer value, revenue attribution, customer ranking",
        loyalty_tier:
          "Customer loyalty level, benefits eligibility, service priority",
        customer_type: "Account classification, pricing tier, service level",
      },
      orders: {
        total_amount: "Order value, revenue tracking, financial reporting",
        status:
          "Fulfillment stage, operational tracking, customer communication",
        priority:
          "Processing urgency, resource allocation, delivery scheduling",
      },
      inventory: {
        quantity_available:
          "Available stock, sales capacity, order fulfillment",
        total_value: "Inventory asset value, financial reporting, insurance",
      },
    };
    return meanings[tableName]?.[columnName] || "Standard data field";
  }

  /**
   * Get column usage patterns
   */
  getColumnUsage(tableName, columnName) {
    const usages = {
      total_spent:
        "Customer ranking, value analysis, loyalty program eligibility",
      total_amount: "Revenue calculation, order analysis, financial reporting",
      status: "Filtering, workflow management, operational dashboards",
      quantity_available: "Stock checking, order validation, reorder triggers",
      customer_type: "Access control, pricing application, service delivery",
    };
    return usages[columnName] || "General purpose data access";
  }

  /**
   * Enrich documents with business context and RBAC information
   */
  async enrichWithBusinessContext(documents) {
    const enrichedDocs = [];

    for (const doc of documents) {
      // Add RBAC information
      const rbacInfo = this.getRBACRequirements(
        doc.table_name,
        doc.column_name,
      );

      // Add business relationships
      const relationships = this.getTableRelationships(doc.table_name);

      // Create enriched document
      const enrichedDoc = {
        ...doc,
        content:
          doc.content +
          `\n\nAccess Control: ${rbacInfo.description}
Required Permissions: ${rbacInfo.permissions.join(", ")}
Related Tables: ${relationships.join(", ")}
Security Level: ${rbacInfo.securityLevel}`,
        metadata: {
          ...doc.metadata,
          rbac: rbacInfo,
          relationships: relationships,
          business_context: true,
        },
      };

      enrichedDocs.push(enrichedDoc);
    }

    return enrichedDocs;
  }

  /**
   * Get RBAC requirements for table/column access
   */
  getRBACRequirements(tableName, columnName = null) {
    const tableRBAC = {
      customers: {
        read: ["employee", "manager", "admin"],
        aggregate: ["manager", "admin"],
        personal_data: ["admin"],
        securityLevel: "high",
      },
      orders: {
        read: ["employee", "manager", "admin"],
        aggregate: ["manager", "admin"],
        financial_data: ["manager", "admin"],
        securityLevel: "medium",
      },
      products: {
        read: ["employee", "manager", "admin"],
        write: ["manager", "admin"],
        securityLevel: "low",
      },
      inventory: {
        read: ["employee", "manager", "admin"],
        operational: ["manager", "admin"],
        securityLevel: "medium",
      },
    };

    const rbac = tableRBAC[tableName] || {
      read: ["admin"],
      securityLevel: "high",
    };

    // Column-specific restrictions
    const sensitiveColumns = ["email", "phone", "address", "payment_method"];
    if (columnName && sensitiveColumns.includes(columnName)) {
      rbac.securityLevel = "high";
      rbac.personal_data = ["admin"];
    }

    return {
      permissions: Object.values(rbac)
        .flat()
        .filter((p) => typeof p === "string"),
      securityLevel: rbac.securityLevel,
      description: `${rbac.securityLevel} security table requiring ${rbac.read?.join(", ") || "admin"} access`,
    };
  }

  /**
   * Get table relationships for join operations
   */
  getTableRelationships(tableName) {
    const relationships = {
      customers: ["orders", "order_items"],
      orders: ["customers", "order_items", "warehouses"],
      products: ["categories", "suppliers", "inventory", "order_items"],
      inventory: ["products", "warehouses"],
      suppliers: ["products"],
      warehouses: ["orders", "inventory"],
      categories: ["products"],
      order_items: ["orders", "products"],
    };
    return relationships[tableName] || [];
  }

  /**
   * Store enriched documents in ChromaDB
   */
  async storeInVectorDatabase(documents) {
    try {
      // Validate documents before processing
      this.validateDocuments(documents);

      // Create or get schema collection with optional embedding function
      const collectionConfig = {
        name: this.collectionName,
        metadata: {
          description:
            "Database schema and business context for intelligent query generation",
          type: "schema_storage",
          created_at: new Date().toISOString(),
          document_count: documents.length,
        },
      };

      // Always add embeddingFunction for consistent embeddings
      collectionConfig.embeddingFunction = this.embeddingFunction;

      const collection =
        await this.client.getOrCreateCollection(collectionConfig);

      // Clear existing schema documents
      await this.clearExistingSchemaDocuments(collection);

      // Process documents in batches
      const batchSize = 10;
      let storedCount = 0;

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);

        // Prepare batch data for ChromaDB (let ChromaDB handle embeddings)
        const ids = batch.map((doc) => doc.id);
        const texts = batch.map((doc) => doc.content);
        const metadatas = batch.map((doc) => doc.metadata);

        // Store in ChromaDB with proper error handling
        try {
          await collection.add({
            ids: ids,
            documents: texts,
            metadatas: metadatas,
          });
        } catch (addError) {
          console.error(
            `Failed to add batch ${Math.floor(i / batchSize) + 1}:`,
            addError.message,
          );
          throw new Error(`Batch addition failed: ${addError.message}`);
        }

        storedCount += batch.length;
        console.log(
          `Stored ${storedCount}/${documents.length} schema documents`,
        );
      }

      console.log("Schema documents successfully stored in ChromaDB");
      return { success: true, stored: storedCount };
    } catch (error) {
      throw new Error(
        `Failed to store documents in vector database: ${error.message}`,
      );
    }
  }

  /**
   * Validate documents before ChromaDB ingestion
   */
  validateDocuments(documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("Documents must be a non-empty array");
    }

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      // Validate required fields
      if (!doc.id || typeof doc.id !== "string") {
        throw new Error(`Document ${i}: missing or invalid 'id' field`);
      }

      if (!doc.content || typeof doc.content !== "string") {
        throw new Error(`Document ${i}: missing or invalid 'content' field`);
      }

      if (!doc.metadata || typeof doc.metadata !== "object") {
        throw new Error(`Document ${i}: missing or invalid 'metadata' field`);
      }

      // Validate content length (ChromaDB has limits)
      if (doc.content.length > 50000) {
        console.warn(
          `Document ${i}: content length ${doc.content.length} may be too large for ChromaDB`,
        );
      }

      // Validate metadata structure
      if (doc.metadata.table && typeof doc.metadata.table !== "string") {
        throw new Error(`Document ${i}: metadata.table must be a string`);
      }

      // Check for duplicate IDs
      const duplicateIndex = documents.findIndex(
        (otherDoc, j) => j !== i && otherDoc.id === doc.id,
      );
      if (duplicateIndex !== -1) {
        throw new Error(
          `Duplicate document ID '${doc.id}' found at indices ${i} and ${duplicateIndex}`,
        );
      }
    }

    console.log(`Validated ${documents.length} schema documents`);
  }

  /**
   * Clear existing schema documents before ingesting new ones
   */
  async clearExistingSchemaDocuments(collection) {
    try {
      // Get all existing documents in the collection
      const existing = await collection.get();

      if (existing.ids && existing.ids.length > 0) {
        await collection.delete({ ids: existing.ids });
        console.log(`Cleared ${existing.ids.length} existing schema documents`);
      }
    } catch (error) {
      console.warn("Could not clear existing documents:", error.message);
      // Continue with ingestion even if clearing fails
    }
  }

  /**
   * Query the schema knowledge base
   */
  async querySchemaKnowledge(query, options = {}) {
    await this.initialize();

    const { limit = 5, threshold = 0.0 } = options;

    try {
      // Get collection with optional embedding function
      const collectionConfig = { name: this.collectionName };

      // Always add embeddingFunction for consistent embeddings
      collectionConfig.embeddingFunction = this.embeddingFunction;

      const collection = await this.client.getCollection(collectionConfig);

      // Search ChromaDB using text query with embedding function
      const results = await collection.query({
        queryTexts: [query],
        nResults: limit,
        include: ["documents", "metadatas", "distances"],
      });

      // Filter results by threshold and format response
      const filteredResults = results.documents[0]
        .map((doc, index) => ({
          document: doc,
          metadata: results.metadatas[0][index],
          relevance: 1 - results.distances[0][index], // Convert distance to similarity
        }))
        .filter((result) => result.relevance >= threshold);

      return {
        success: true,
        query: query,
        results: filteredResults,
        totalFound: results.documents[0].length,
        filteredCount: filteredResults.length,
      };
    } catch (error) {
      console.error("Schema knowledge query failed:", error);
      return {
        success: false,
        error: error.message,
        query: query,
        results: [],
        totalFound: 0,
        filteredCount: 0,
      };
    }
  }
}

module.exports = SchemaIngestor;
