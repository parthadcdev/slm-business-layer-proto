/**
 * Test RAG Retrieval with Business Queries
 * Author: Partha Chandramohan
 */

const chromadbClient = require('../src/rag/chromadb-client');

async function testBusinessQueries() {
    console.log('🔍 Testing RAG Retrieval with Business Queries...\n');

    try {
        // Initialize ChromaDB client
        await chromadbClient.initialize();
        console.log('✅ ChromaDB client initialized\n');

        // Get collection stats
        const stats = await chromadbClient.getStats();
        console.log('📊 Collection Stats:', stats);
        console.log('');

        // Test business queries
        const businessQueries = [
            {
                query: "What are the customer experience analytics requirements?",
                description: "Customer Experience Analytics"
            },
            {
                query: "Show me financial reporting automation features",
                description: "Financial Reporting Automation"
            },
            {
                query: "What are the supplier performance optimization requirements?",
                description: "Supplier Performance Optimization"
            },
            {
                query: "List inventory management business rules",
                description: "Inventory Management Business Rules"
            },
            {
                query: "What are the procurement workflow automation features?",
                description: "Procurement Workflow Automation"
            }
        ];

        for (const testCase of businessQueries) {
            console.log(`🔍 Query: ${testCase.description}`);
            console.log(`   Text: "${testCase.query}"`);

            const results = await chromadbClient.search(testCase.query, {
                topK: 3,
                threshold: 0.0
            });

            if (results && results.length > 0) {
                console.log(`   📊 Found ${results.length} relevant chunks:\n`);

                results.forEach((result, index) => {
                    console.log(`   📄 Result ${index + 1}:`);
                    console.log(`      📁 Source: ${result.metadata.filename || 'Unknown'}`);
                    console.log(`      📝 Section: ${result.metadata.section || 'Unknown'}`);
                    console.log(`      📏 Score: ${(1 - result.score).toFixed(4)}`);
                    console.log(`      📖 Preview: ${result.content.substring(0, 150)}...`);
                    console.log('');
                });
            } else {
                console.log('   ❌ No relevant chunks found\n');
            }

            console.log('   ---\n');
        }

        console.log('✅ RAG retrieval testing completed successfully!');

    } catch (error) {
        console.error('❌ RAG retrieval testing failed:', error.message);
        throw error;
    }
}

// Run the test
if (require.main === module) {
    testBusinessQueries()
        .then(() => {
            console.log('\n🎉 All tests completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Test failed:', error.message);
            process.exit(1);
        });
}

module.exports = { testBusinessQueries };