/**
 * Routes for checking AI services status
 * Provides information about OpenAI service health and availability
 */
const express = require('express');
const router = express.Router();
const openaiService = require('../services/openai');

/**
 * @route GET /api/ai-status
 * @desc Get status and metrics for AI services
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    // Get detailed status information from OpenAI service
    const openaiStatus = openaiService.getStatus();
    
    // Add environment information (but don't expose the actual API key)
    const envInfo = {
      apiKeyConfigured: !!process.env.OPENAI_API_KEY,
      simulateFailure: process.env.SIMULATE_OPENAI_FAILURE === 'true',
      // Show a masked version of the API key if it exists (for UI display)
      apiKeyMasked: process.env.OPENAI_API_KEY 
        ? `sk-...${process.env.OPENAI_API_KEY.slice(-4)}` 
        : null
    };
    
    res.json({
      openai: {
        ...openaiStatus,
        envInfo
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting AI status:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to get AI service status',
      details: error.message
    });
  }
});

/**
 * @route POST /api/ai-status/check-key
 * @desc Check if an OpenAI API key is valid (without saving it)
 * @access Public
 */
router.post('/check-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        error: true,
        message: 'API key is required'
      });
    }
    
    // Simple check of API key format (sk-...)
    if (!apiKey.startsWith('sk-')) {
      return res.status(400).json({
        error: true,
        message: 'Invalid API key format. OpenAI API keys start with "sk-"',
        valid: false
      });
    }
    
    // For security, we don't actually test the API key by making a real API call
    // We just validate the format here
    
    res.json({
      valid: true,
      message: 'API key format is valid. Use the configure endpoint to apply it.'
    });
  } catch (error) {
    console.error('Error checking API key:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to check API key',
      details: error.message
    });
  }
});

/**
 * @route POST /api/ai-status/reset-metrics
 * @desc Reset metrics for tracking
 * @access Public
 */
router.post('/reset-metrics', (req, res) => {
  try {
    openaiService.resetMetrics();
    
    res.json({
      success: true,
      message: 'AI service metrics have been reset',
      currentMetrics: openaiService.getMetrics()
    });
  } catch (error) {
    console.error('Error resetting AI metrics:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to reset AI service metrics',
      details: error.message
    });
  }
});

/**
 * @route POST /api/ai-status/clear-cache
 * @desc Clear the response cache
 * @access Public
 */
router.post('/clear-cache', (req, res) => {
  try {
    openaiService.clearCache();
    
    res.json({
      success: true,
      message: 'AI service response cache has been cleared'
    });
  } catch (error) {
    console.error('Error clearing AI cache:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to clear AI service cache',
      details: error.message
    });
  }
});

/**
 * @route POST /api/ai-status/configure
 * @desc Configure OpenAI API key (temporarily, for the current server session)
 * @access Public
 */
router.post('/configure', (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        error: true,
        message: 'API key is required'
      });
    }
    
    // Special case to reset to the original API key from environment
    if (apiKey === 'RESET_TO_ENV') {
      // Use the original API key from the environment (.env file)
      const originalKey = process.env.ORIGINAL_OPENAI_API_KEY || process.env.OPENAI_API_KEY_ORIGINAL;
      
      if (!originalKey) {
        return res.status(400).json({
          error: true,
          message: 'No original API key found in environment'
        });
      }
      
      process.env.OPENAI_API_KEY = originalKey;
      console.log('[OpenAI] Reset API key to original environment value');
      
      const isConfigured = openaiService.isOpenAIConfigured();
      return res.json({
        success: isConfigured,
        message: 'OpenAI API key reset to original environment value',
        requiresRestart: false
      });
    }
    
    // Simple check of API key format
    if (!apiKey.startsWith('sk-')) {
      return res.status(400).json({
        error: true,
        message: 'Invalid API key format. OpenAI API keys start with "sk-"'
      });
    }
    
    // Save the original key if we haven't already (for reset functionality)
    if (!process.env.ORIGINAL_OPENAI_API_KEY) {
      process.env.ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }
    
    // Set the API key in the environment
    process.env.OPENAI_API_KEY = apiKey;
    
    // Dynamically reconfigure OpenAI (no restart needed with our updated setup)
    // We're using a dynamic OpenAI client configuration that checks the environment variables
    // each time it's accessed
    
    // Check if the configuration was successful
    const isConfigured = openaiService.isOpenAIConfigured();
    
    res.json({
      success: isConfigured,
      message: isConfigured 
        ? 'OpenAI API key successfully configured and ready to use' 
        : 'API key set but OpenAI client configuration failed',
      requiresRestart: false
    });
  } catch (error) {
    console.error('Error configuring API key:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to configure API key',
      details: error.message
    });
  }
});

module.exports = router;