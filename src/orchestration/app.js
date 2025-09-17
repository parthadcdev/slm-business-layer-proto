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
const jwt = require('jsonwebtoken');

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
    const response = await axios.get('http://localhost:8000/api/v2/version');
    const version = response.data.replace(/"/g, '');
    res.json({ status: 'online', version: version, url: 'http://localhost:8000' });
  } catch (error) {
    res.json({ status: 'offline', error: error.message });
  }
});

app.get('/api/service-status/ollama', async (req, res) => {
  try {
    const response = await axios.get('http://localhost:11434/api/tags');
    res.json({ status: 'online', models: response.data.models?.length || 0, url: 'http://localhost:11434' });
  } catch (error) {
    res.json({ status: 'offline', error: error.message });
  }
});

// Token generation endpoint for browser testing
app.post('/api/generate-token', (req, res) => {
  try {
    const { userId = 'browser-user', role = 'admin', email = 'browser@test.com' } = req.body;

    const token = jwt.sign(
      {
        id: userId,
        role: role,
        email: email
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token: token,
      expiresIn: '24h',
      user: { id: userId, role: role, email: email }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Token generation failed: ' + error.message
    });
  }
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
    const { request, context } = req.body;

    // Build context and prompt
    const enrichedContext = await contextManager.enrichContext(context, req.user);
    const prompt = await promptBuilder.buildPrompt(request, enrichedContext);

    // TODO: Forward to SLM service
    // const response = await slmService.processRequest(prompt);

    res.json({
      success: true,
      message: 'Request processed successfully',
      // data: response
    });
  } catch (error) {
    console.error('Error processing business request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Orchestration service running on port ${PORT}`);
});

module.exports = app;