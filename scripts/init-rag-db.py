#!/usr/bin/env python3
"""
SLM Business Service Layer - RAG Database Initialization Script

@author: Partha Chandramohan
@description: Initializes ChromaDB with business requirements documents and sets up the vector store for semantic search
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import List, Dict, Any

# Check if we're in the right directory
project_root = Path(__file__).parent.parent
if not (project_root / "src").exists():
    print("Error: This script must be run from the project root directory.")
    print("Current directory:", os.getcwd())
    print("Expected project root:", project_root)
    sys.exit(1)

# Check for virtual environment
venv_path = project_root / "venv"
if not venv_path.exists():
    print("Error: Python virtual environment not found.")
    print("Please run the setup script first:")
    print("  ./scripts/setup-local.sh")
    print("Or create and activate a virtual environment:")
    print("  python3 -m venv venv")
    print("  source venv/bin/activate")
    print("  pip install -r requirements.txt")
    sys.exit(1)

# Check if we're in the virtual environment
if sys.prefix == sys.base_prefix:
    print("Warning: Virtual environment not activated.")
    print("Please activate the virtual environment:")
    print("  source venv/bin/activate")
    print("Then run this script again.")

    # Try to activate venv programmatically (may not work in all shells)
    activate_script = venv_path / "bin" / "activate"
    if activate_script.exists():
        print(f"\nOr run: source {activate_script} && python3 scripts/init-rag-db.py")
    sys.exit(1)

# Add the project root to the Python path
sys.path.insert(0, str(project_root / "src"))

# Try to import required modules with better error handling
try:
    import chromadb
    import sentence_transformers
    print("✓ Core dependencies found")
except ImportError as e:
    print(f"Error: Missing required dependencies: {e}")
    print("Please install dependencies:")
    print("  pip install -r requirements.txt")
    sys.exit(1)

# Since the full modules don't exist yet, we'll create a simplified version
print("Note: Using simplified implementation since full modules are not yet implemented.")
print("This script will create sample documents and demonstrate the RAG concept.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SimpleRAGInitializer:
    """Simplified RAG initializer that works with available dependencies."""

    def __init__(self, data_dir: str = None):
        self.project_root = project_root
        self.data_dir = Path(data_dir) if data_dir else self.project_root / "data"
        self.documents_dir = self.data_dir / "documents"
        self.chroma_dir = self.project_root / "chroma_data"

        # Create directories if they don't exist
        self.documents_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)

        # Initialize ChromaDB client
        self.chroma_client = None
        self.collection = None

    def initialize(self):
        """Initialize ChromaDB connection."""
        logger.info("Initializing simplified RAG database system...")

        try:
            # Initialize ChromaDB
            self.chroma_client = chromadb.PersistentClient(path=str(self.chroma_dir))

            # Create or get collection
            try:
                self.collection = self.chroma_client.get_collection(name="business_requirements")
                logger.info("Connected to existing collection")
            except Exception:
                self.collection = self.chroma_client.create_collection(
                    name="business_requirements",
                    metadata={"description": "Business requirements and documentation"}
                )
                logger.info("Created new collection")

            logger.info("ChromaDB initialized successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            return False

    def create_sample_documents(self):
        """Create sample business documents if they don't exist."""
        logger.info("Creating sample business documents...")

        # Sample Business Requirements Document
        brd_content = """# Business Requirements Document - Order Management System

## Document Information
- **Document ID**: BRD-001
- **Version**: 1.0
- **Date**: 2024-01-15
- **Author**: Business Analysis Team
- **Department**: Operations

## Executive Summary
This document outlines the business requirements for implementing an intelligent order management system powered by Small Language Model (SLM) technology.

## Business Objectives
- Automate order processing workflows
- Improve customer satisfaction through faster processing
- Reduce manual errors in order handling
- Enable intelligent business decision making

## Business Rules

### Order Creation Rules
- **BR-001**: All orders must have a unique order ID
- **BR-002**: Orders must contain at least one valid product
- **BR-003**: Customer information must be verified before order creation
- **BR-004**: Order total must be calculated including applicable taxes
- **BR-005**: Inventory must be checked before confirming order

### Order Status Management
- **BR-006**: Orders start with 'PENDING' status
- **BR-007**: Orders can only be cancelled if status is 'PENDING' or 'CONFIRMED'
- **BR-008**: Orders with 'SHIPPED' status cannot be modified
- **BR-009**: Order status changes must be logged with timestamp and user

### Payment Processing
- **BR-010**: Payment must be authorized before order confirmation
- **BR-011**: Failed payments must trigger order cancellation
- **BR-012**: Refunds can only be processed for paid orders
- **BR-013**: Partial refunds are allowed for partially shipped orders

### Inventory Management
- **BR-014**: Inventory must be reserved upon order confirmation
- **BR-015**: Reserved inventory is released if order is cancelled
- **BR-016**: Stock levels must be updated in real-time
- **BR-017**: Low stock alerts must be generated automatically

## Functional Requirements

### User Management
- **REQ-001**: System shall authenticate users before allowing access
- **REQ-002**: System shall support role-based permissions (Customer, Employee, Manager, Admin)
- **REQ-003**: System shall track user sessions and enforce timeout policies
- **REQ-004**: System shall log all user actions for audit purposes

### Order Processing
- **REQ-005**: System shall validate order data before processing
- **REQ-006**: System shall calculate order totals including taxes and discounts
- **REQ-007**: System shall check inventory availability in real-time
- **REQ-008**: System shall send order confirmation emails
- **REQ-009**: System shall provide order tracking capabilities

### Business Intelligence
- **REQ-010**: System shall generate daily sales reports
- **REQ-011**: System shall track key performance indicators (KPIs)
- **REQ-012**: System shall provide predictive analytics for inventory
- **REQ-013**: System shall support natural language queries for business data

## API Requirements

### Authentication Endpoints
- POST /auth/login - User authentication
- POST /auth/logout - User logout
- POST /auth/refresh - Token refresh

### Order Management Endpoints
- GET /api/orders - Retrieve orders with filtering
- POST /api/orders - Create new order
- PUT /api/orders/{id} - Update order
- DELETE /api/orders/{id} - Cancel order
- GET /api/orders/{id}/status - Get order status

### Business Intelligence Endpoints
- POST /api/business/query - Natural language business queries
- GET /api/reports/sales - Sales reports
- GET /api/analytics/kpi - Key performance indicators

## Acceptance Criteria

### Order Creation Flow
Given a valid customer and product selection
When the customer submits an order
Then the system validates all information
And creates an order with PENDING status
And reserves inventory
And sends confirmation email
And returns order details

### Payment Processing Flow
Given a pending order with payment information
When payment is processed
Then the system validates payment method
And processes payment through gateway
And updates order status to CONFIRMED
And commits inventory reservation
And sends payment confirmation

### Business Query Processing
Given a natural language business question
When user submits query through API
Then the system processes query using SLM
And retrieves relevant business data
And generates human-readable response
And logs query for audit purposes

## Integration Requirements
- Integration with payment gateways (Stripe, PayPal)
- Integration with inventory management system
- Integration with email notification service
- Integration with shipping providers
- Integration with analytics platform

## Security Requirements
- All API endpoints must require authentication
- Sensitive data must be encrypted at rest and in transit
- All business operations must be logged
- Role-based access control must be enforced
- Regular security audits must be performed

## Performance Requirements
- API response time must be under 500ms for 95% of requests
- System must handle 1000 concurrent users
- Database queries must complete within 200ms
- Order processing must complete within 2 seconds
- Business queries must complete within 5 seconds
"""

        # Sample API Documentation
        api_docs = """# API Documentation - SLM Business Service Layer

## Overview
This document provides comprehensive API documentation for the SLM-powered business service layer.

## Authentication
All API endpoints require authentication using JWT tokens.

### Obtaining a Token
```
POST /auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "securepassword"
}
```

### Using the Token
Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Business Logic API

### Process Business Request
Processes natural language business requests using the SLM.

**Endpoint**: `POST /api/business-request`

**Request Body**:
```json
{
  "request": "Show me all pending orders for customer ID 12345",
  "context": {
    "userId": "user123",
    "sessionId": "session456",
    "department": "sales"
  }
}
```

**Response**:
```json
{
  "success": true,
  "response": {
    "type": "database_query",
    "analysis": "User is requesting pending orders for a specific customer",
    "actions": [
      {
        "type": "database",
        "operation": "select",
        "table": "orders",
        "parameters": {
          "where": {
            "customer_id": "12345",
            "status": "pending"
          }
        }
      }
    ],
    "data": [...],
    "confidence": 0.95
  }
}
```

## Order Management API

### Get Orders
Retrieves orders based on specified criteria.

**Endpoint**: `GET /api/orders`

**Parameters**:
- `status` (optional): Filter by order status
- `customer_id` (optional): Filter by customer ID
- `date_from` (optional): Start date filter (YYYY-MM-DD)
- `date_to` (optional): End date filter (YYYY-MM-DD)
- `limit` (optional): Maximum number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Example Request**:
```
GET /api/orders?status=pending&limit=10&offset=0
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "ORD-001",
      "customer_id": "CUST-123",
      "status": "pending",
      "total_amount": 99.99,
      "items": [
        {
          "product_id": "PROD-001",
          "quantity": 2,
          "price": 49.99
        }
      ],
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

### Create Order
Creates a new order in the system.

**Endpoint**: `POST /api/orders`

**Request Body**:
```json
{
  "customer_id": "CUST-123",
  "items": [
    {
      "product_id": "PROD-001",
      "quantity": 2,
      "price": 49.99
    },
    {
      "product_id": "PROD-002",
      "quantity": 1,
      "price": 29.99
    }
  ],
  "shipping_address": {
    "street": "123 Main St",
    "city": "Anytown",
    "state": "CA",
    "zip": "12345"
  },
  "payment_method": "credit_card"
}
```

## Error Handling
All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "customer_id",
      "reason": "Customer ID is required"
    }
  }
}
```

## Status Codes
- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `422 Unprocessable Entity`: Validation error
- `500 Internal Server Error`: Server error

## Rate Limiting
API endpoints are rate limited to prevent abuse:
- 100 requests per minute per user for general endpoints
- 20 requests per minute per user for business query endpoints
- 10 requests per minute per user for order creation endpoints

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
```
"""

        # Sample Policy Document
        policy_doc = """# Data Privacy and Security Policy

## Document Information
- **Policy ID**: POL-001
- **Version**: 2.1
- **Effective Date**: 2024-01-01
- **Review Date**: 2024-12-31
- **Owner**: Information Security Team

## Purpose
This policy establishes guidelines for data privacy and security within the SLM business service layer to ensure compliance with applicable regulations and protect customer data.

## Scope
This policy applies to all employees, contractors, and third parties who have access to the SLM business service layer and associated data.

## Data Classification

### Public Data
- Marketing materials
- Public product information
- Published API documentation

### Internal Data
- Employee information (non-sensitive)
- Internal business processes
- System configuration (non-security related)

### Confidential Data
- Customer personal information
- Financial data
- Business intelligence reports
- Internal security procedures

### Restricted Data
- Authentication credentials
- Encryption keys
- Personal health information
- Payment card data

## Access Control Requirements

### Authentication
- All users must authenticate using strong passwords or multi-factor authentication
- Service accounts must use API keys or certificates
- Authentication events must be logged

### Authorization
- Access must be granted based on the principle of least privilege
- Role-based access control (RBAC) must be implemented
- Regular access reviews must be conducted

### Session Management
- User sessions must timeout after 24 hours
- Concurrent session limits must be enforced
- Session activities must be monitored

## Data Protection

### Encryption
- All data must be encrypted in transit using TLS 1.3 or higher
- Sensitive data at rest must be encrypted using AES-256
- Encryption keys must be managed securely

### Data Retention
- Customer data must be retained for no longer than necessary
- Audit logs must be retained for 7 years
- Data deletion procedures must be followed

### Data Masking
- Production data must not be used in non-production environments
- Personally identifiable information (PII) must be masked in logs
- Test data must be anonymized or synthetic

## Incident Response

### Detection
- Security monitoring must be active 24/7
- Automated alerts must be configured for security events
- Regular security assessments must be conducted

### Response
- Security incidents must be reported within 1 hour
- Incident response team must be activated for critical incidents
- Communication procedures must be followed

### Recovery
- Business continuity procedures must be implemented
- Data backup and recovery processes must be tested
- Post-incident reviews must be conducted

## Compliance Requirements

### GDPR Compliance
- Data subject rights must be respected
- Consent must be obtained where required
- Data processing activities must be documented

### SOX Compliance (if applicable)
- Financial data controls must be implemented
- Change management procedures must be followed
- Regular compliance audits must be conducted

## Monitoring and Auditing

### Logging Requirements
- All access to sensitive data must be logged
- Security events must be centrally collected
- Log integrity must be protected

### Monitoring
- Real-time security monitoring must be implemented
- Anomaly detection must be active
- Performance monitoring must include security metrics

### Auditing
- Regular security audits must be conducted
- Compliance assessments must be performed annually
- Audit findings must be remediated promptly

## Training and Awareness

### Security Training
- All employees must complete annual security training
- Role-specific training must be provided
- Security awareness updates must be communicated regularly

### Incident Response Training
- Incident response team must be trained annually
- Tabletop exercises must be conducted quarterly
- Response procedures must be updated based on lessons learned

## Policy Violations
Violations of this policy may result in disciplinary action, up to and including termination of employment or contract.

## Policy Review
This policy will be reviewed annually and updated as necessary to address changes in technology, regulations, and business requirements.
"""

        # Write sample documents
        sample_docs = [
            (self.documents_dir / "business_requirements.md", brd_content),
            (self.documents_dir / "api_documentation.md", api_docs),
            (self.documents_dir / "security_policy.md", policy_doc)
        ]

        for doc_path, content in sample_docs:
            if not doc_path.exists():
                doc_path.write_text(content, encoding='utf-8')
                logger.info(f"Created sample document: {doc_path.name}")
            else:
                logger.info(f"Sample document already exists: {doc_path.name}")

    def process_documents(self) -> List[Dict[str, Any]]:
        """Process all documents in the documents directory."""
        logger.info("Processing business documents...")

        processed_docs = []
        doc_files = list(self.documents_dir.glob("*.md")) + list(self.documents_dir.glob("*.txt"))

        if not doc_files:
            logger.warning("No documents found in documents directory")
            return processed_docs

        for doc_path in doc_files:
            try:
                logger.info(f"Processing document: {doc_path.name}")

                # Read document content
                with open(doc_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Create document structure
                processed_doc = {
                    'content': content,
                    'filename': doc_path.name,
                    'type': self.classify_document(doc_path.name),
                    'created_at': '2024-01-15T10:00:00Z',
                    'file_path': str(doc_path)
                }

                processed_docs.append(processed_doc)
                logger.info(f"Successfully processed: {doc_path.name}")

            except Exception as e:
                logger.error(f"Failed to process document {doc_path.name}: {e}")
                continue

        return processed_docs

    def classify_document(self, filename: str) -> str:
        """Classify document type based on filename."""
        filename_lower = filename.lower()

        if 'brd' in filename_lower or 'business_req' in filename_lower or 'requirement' in filename_lower:
            return 'business-requirement'
        elif 'api' in filename_lower or 'endpoint' in filename_lower:
            return 'api-documentation'
        elif 'policy' in filename_lower or 'procedure' in filename_lower:
            return 'policy'
        elif 'spec' in filename_lower or 'specification' in filename_lower:
            return 'specification'
        else:
            return 'general'

    async def populate_vector_store(self, documents: List[Dict[str, Any]]):
        """Populate the vector store with processed documents."""
        logger.info("Populating vector store...")

        total_chunks = 0

        for doc in documents:
            try:
                logger.info(f"Adding document to vector store: {doc['metadata']['filename']}")

                # Add document to vector store
                result = await self.vector_store.addDocument(doc)

                if result['success']:
                    total_chunks += result['chunksAdded']
                    logger.info(f"Added {result['chunksAdded']} chunks from {doc['metadata']['filename']}")
                else:
                    logger.error(f"Failed to add document: {doc['metadata']['filename']}")

            except Exception as e:
                logger.error(f"Error adding document to vector store: {e}")
                continue

        logger.info(f"Vector store populated with {total_chunks} total chunks from {len(documents)} documents")

    async def verify_setup(self):
        """Verify that the RAG system is working correctly."""
        logger.info("Verifying RAG system setup...")

        try:
            # Test vector store health
            health = await self.vector_store.checkHealth()
            if health['healthy']:
                logger.info("Vector store health check passed")
            else:
                logger.error(f"Vector store health check failed: {health}")
                return False

            # Test search functionality
            test_query = "How do I create a new order?"
            results = await self.vector_store.search(test_query, {'topK': 3})

            if results:
                logger.info(f"Search test successful: found {len(results)} results for test query")
                for i, result in enumerate(results[:2]):
                    logger.info(f"Result {i+1}: {result['content'][:100]}...")
            else:
                logger.warning("Search test returned no results")

            # Get vector store statistics
            stats = await self.vector_store.getStats()
            if stats:
                logger.info(f"Vector store stats: {stats['documentCount']} documents indexed")

            return True

        except Exception as e:
            logger.error(f"Verification failed: {e}")
            return False

    def add_documents_to_collection(self, documents):
        """Add documents to the ChromaDB collection."""
        logger.info("Adding documents to ChromaDB collection...")

        try:
            # Prepare documents for ChromaDB
            doc_ids = []
            doc_texts = []
            doc_metadatas = []

            for i, doc in enumerate(documents):
                doc_id = f"doc_{i}_{hash(doc['content'][:100])}"
                doc_ids.append(doc_id)
                doc_texts.append(doc['content'])
                doc_metadatas.append({
                    'filename': doc.get('filename', 'unknown'),
                    'type': doc.get('type', 'document'),
                    'created_at': doc.get('created_at', '2024-01-15T10:00:00Z')
                })

            # Add to collection
            self.collection.add(
                documents=doc_texts,
                metadatas=doc_metadatas,
                ids=doc_ids
            )

            logger.info(f"Successfully added {len(documents)} documents to collection")
            return True

        except Exception as e:
            logger.error(f"Failed to add documents to collection: {e}")
            return False

    def test_query(self, query="How do I create a new order?"):
        """Test the RAG system with a sample query."""
        logger.info(f"Testing query: {query}")

        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=3
            )

            if results['documents'] and results['documents'][0]:
                logger.info(f"Found {len(results['documents'][0])} relevant documents")
                for i, doc in enumerate(results['documents'][0]):
                    logger.info(f"Result {i+1}: {doc[:100]}...")
                return True
            else:
                logger.warning("No documents found for test query")
                return False

        except Exception as e:
            logger.error(f"Test query failed: {e}")
            return False

    def get_collection_stats(self):
        """Get statistics about the collection."""
        try:
            count = self.collection.count()
            logger.info(f"Collection contains {count} documents")
            return count
        except Exception as e:
            logger.error(f"Failed to get collection stats: {e}")
            return 0

    def run(self):
        """Run the complete RAG initialization process."""
        try:
            # Initialize components
            if not self.initialize():
                return False

            # Create sample documents
            self.create_sample_documents()

            # Process documents
            documents = self.process_documents()

            if not documents:
                logger.error("No documents were processed successfully")
                return False

            # Add documents to collection
            if not self.add_documents_to_collection(documents):
                return False

            # Test the system
            if not self.test_query():
                logger.warning("Test query failed, but initialization may still be successful")

            # Get final stats
            count = self.get_collection_stats()

            logger.info("RAG database initialization completed successfully!")
            return True

        except Exception as e:
            logger.error(f"RAG initialization failed: {e}")
            return False


def main():
    """Main function to run the RAG initialization."""
    import argparse

    parser = argparse.ArgumentParser(description="Initialize RAG database for SLM business service layer")
    parser.add_argument("--data-dir", help="Directory containing documents to process")
    parser.add_argument("--clear", action="store_true", help="Clear existing collection before initialization")

    args = parser.parse_args()

    initializer = SimpleRAGInitializer(data_dir=args.data_dir)

    if args.clear:
        logger.info("Clearing existing collection...")
        try:
            if initializer.initialize():
                initializer.chroma_client.delete_collection(name="business_requirements")
                logger.info("Collection cleared successfully")
        except Exception as e:
            logger.warning(f"Could not clear collection (may not exist): {e}")

    success = initializer.run()

    if success:
        print("\n✅ RAG database initialization completed successfully!")
        print("\nNext steps:")
        print("1. Start the services: npm run dev:services")
        print("2. Start the orchestration service: npm run dev")
        print("3. Test ChromaDB: curl http://localhost:8000/api/v1/heartbeat")
        print("4. Check the chroma_data directory for the database files")
        print(f"5. Collection location: {initializer.chroma_dir}")
    else:
        print("\n❌ RAG database initialization failed. Check the logs for details.")
        sys.exit(1)


if __name__ == "__main__":
    main()