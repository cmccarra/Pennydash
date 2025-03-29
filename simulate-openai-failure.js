/**
 * Configure OpenAI API to simulate failures
 * Used for testing the fallback mechanisms
 */

// Set environment variable to make the OpenAI service simulate failures
process.env.SIMULATE_OPENAI_FAILURE = 'true';

// When this module is imported, the environment variable will be set
// and the OpenAI service will simulate failures
console.log('[SIMULATE] Setting OpenAI service to simulation mode');