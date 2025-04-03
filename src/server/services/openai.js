
const OpenAI = require('openai');

// Configure OpenAI client with error handling
const openai = process.env.OPENAI_API_KEY ? 
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : 
  null;

// Configuration flag for testing
const SIMULATE_FAILURE = process.env.SIMULATE_OPENAI_FAILURE === 'true';

// Rate limit configuration in milliseconds (1 minute)
const RATE_LIMIT_WINDOW = 60000; 

// Check if OpenAI API key is configured
const API_KEY_CONFIGURED = !!process.env.OPENAI_API_KEY;

// Flag to indicate if OpenAI is available
const OPENAI_AVAILABLE = API_KEY_CONFIGURED && !SIMULATE_FAILURE;

/**
 * Check if OpenAI is properly configured
 * @returns {boolean} Whether OpenAI is properly configured
 */
function isOpenAIConfigured() {
  return !!openai;
}

/**
 * Check if OpenAI service is rate limited
 * @returns {boolean} Whether the service is rate limited
 */
function isRateLimited() {
  // If simulating failure, always return true
  if (SIMULATE_FAILURE) {
    console.log('[OpenAI] Simulating API failure for testing');
    metrics.isRateLimited = true;
    return true;
  }

  // If OpenAI is not configured, we should consider it rate limited
  if (!isOpenAIConfigured()) {
    console.log('[OpenAI] OpenAI is not configured');
    return true;
  }
  
  // If we've seen a rate limit error recently, enforce a cooldown period
  if (metrics.lastRateLimitTime > 0) {
    const timeSinceLastRateLimit = Date.now() - metrics.lastRateLimitTime;
    if (timeSinceLastRateLimit < RATE_LIMIT_WINDOW) {
      // Still in the rate limit cooldown window
      return true;
    } else {
      // Reset rate limit status after cooldown
      metrics.lastRateLimitTime = 0;
      metrics.isRateLimited = false;
    }
  }
  
  return metrics.isRateLimited;
}

/**
 * Generate a summary for a batch of transactions
 * @param {Array} transactions - Array of transaction objects
 * @param {number} timeoutMs - Timeout in milliseconds (defaults to 15 seconds)
 * @returns {Promise<Object>} Object with summary and insights
 */
async function generateBatchSummary(transactions, timeoutMs = 15000) {
  // Check if OpenAI is available
  if (!isAvailable()) {
    console.log(`[OpenAI] API not available for batch summary`);
    return {
      summary: "Transactions Batch",
      insights: ["OpenAI API not available for generating insights."],
      timedOut: false,
      error: true,
      errorType: "api_not_configured"
    };
  }

  try {
    console.log(`[OpenAI] Generating summary for ${transactions.length} transactions with ${timeoutMs}ms timeout`);
    metrics.apiCalls++;
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error('Batch summary generation timed out');
        error.code = 'TIMEOUT';
        metrics.timeoutErrors++;
        reject(error);
      }, timeoutMs);
    });
    
    // Format transactions for the prompt (limit to 15 to avoid token limits)
    const transactionSummary = transactions.slice(0, 15).map((t, idx) => 
      `Transaction ${idx + 1}: "${t.description}" for $${t.amount} (${t.type || 'expense'})${t.merchant ? ` - Merchant: ${t.merchant}` : ''}${t.category ? ` - Category: ${t.category}` : ''}`
    ).join('\n');
    
    // Add transaction count info if we're limiting the sample
    const transactionCountInfo = transactions.length > 15 
      ? `\n(Showing 15 of ${transactions.length} total transactions)`
      : '';
    
    const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0).toFixed(2);
    
    // Get date range info
    const dates = transactions
      .map(t => new Date(t.date))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a - b);
    
    const dateRangeSummary = dates.length > 0 
      ? `Date range: ${dates[0].toLocaleDateString()} to ${dates[dates.length-1].toLocaleDateString()}` 
      : 'Date range: Unknown';
    
    // Create the API request configuration
    const requestConfig = {
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. Do not change this unless explicitly requested by the user
      messages: [{
        role: "system",
        content: "You are a financial analyst assistant. Your task is to analyze transaction data and provide a concise, informative summary. Focus on identifying patterns, dominant merchants, time periods, and any notable insights. Look for travel expenses, subscription patterns, or unusual spending.\n\nCRITICAL: Your summary MUST be NO LONGER THAN 8 WORDS - absolutely no exceptions. It should be very short but descriptive.\n\nRespond with a JSON object containing:\n1. summary: Your 8-words-or-less summary\n2. insights: Array of brief insights"
      }, {
        role: "user",
        content: `Please analyze these transactions and provide a summary and key insights as a JSON object:\n\n${transactionSummary}${transactionCountInfo}\n\n${dateRangeSummary}\nTotal amount: $${totalAmount}\nTotal transactions: ${transactions.length}`
      }],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: "json_object" }
    };
    
    // Process function that makes the API call with retry logic
    const processSummary = async () => {
      const completion = await callWithRetry(
        async () => {
          if (!openai) {
            throw new Error('OpenAI client not available');
          }
          return await openai.chat.completions.create(requestConfig);
        }
      );
      
      // Parse the JSON response
      const responseText = completion.choices[0].message.content.trim();
      console.log(`[OpenAI] Batch summary response: ${responseText.length} characters`);
      
      try {
        const response = JSON.parse(responseText);
        metrics.successfulCalls++;
        
        // Expected format: { summary: string, insights: string[] }
        return {
          summary: response.summary || "Transaction Batch",
          insights: Array.isArray(response.insights) ? response.insights : 
                  (response.insights ? [response.insights] : []),
          timedOut: false
        };
      } catch (parseError) {
        console.error('[OpenAI] Failed to parse JSON response:', parseError);
        metrics.errors++;
        metrics.parseFailed++;
        
        // Fallback - extract key information from text
        const lines = responseText.split('\n').filter(line => line.trim());
        const summary = lines[0] || "Transaction Batch";
        const insights = lines.slice(1).filter(line => line.trim());
        
        return {
          summary,
          insights: insights.length > 0 ? insights : ["No additional insights available."],
          timedOut: false,
          parseError: true
        };
      }
    };
    
    // Race the timeout against the actual API call
    const result = await Promise.race([
      timeoutPromise,
      processSummary()
    ]);
    
    return result;
  } catch (error) {
    console.error('[OpenAI] API Error generating batch summary:', error);
    
    // Update error metrics
    metrics.errors++;
    metrics.lastError = error.message;
    metrics.lastErrorTime = Date.now();
    
    // Check if this was a timeout
    const timedOut = error.code === 'TIMEOUT';
    if (timedOut) {
      console.log('[OpenAI] Batch summary generation timed out');
    }
    
    return {
      summary: timedOut ? "Transaction Batch (Summary Generation Timed Out)" : "Transaction Batch",
      insights: timedOut 
        ? ["Summary generation timed out. Try again or view individual transactions."] 
        : [`Error generating insights: ${error.message}`],
      timedOut,
      error: true,
      errorType: timedOut ? 'timeout' : 
                 error.message.includes('rate limit') ? 'rate_limit' : 
                 error.name === 'SyntaxError' ? 'parse_error' : 'api_error'
    };
  }
}

// Tracking metrics and cache to optimize API usage
const metrics = {
  apiCalls: 0,
  cacheHits: 0,
  batchRequests: 0,
  errors: 0,
  rateLimitErrors: 0,
  retries: 0,
  startTime: Date.now(),
  lastRateLimitTime: 0,
  isRateLimited: false,
  lastError: null,
  lastErrorTime: null,
  connectionErrors: 0,
  timeoutErrors: 0,
  parseFailed: 0,
  successfulCalls: 0
};

// Simple in-memory cache for OpenAI responses
// Key: transaction description + amount + type
// Value: categorization response
const responseCache = new Map();

// Cache size limit (items)
const CACHE_SIZE_LIMIT = 1000;

// Cache TTL (24 hours in milliseconds)
const CACHE_TTL = 24 * 60 * 60 * 1000;

// Rate limiting settings
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Add an item to the cache with TTL
 * @param {string} key - Cache key
 * @param {Object} value - Value to cache
 */
function addToCache(key, value) {
  // If cache is at capacity, remove oldest entries
  if (responseCache.size >= CACHE_SIZE_LIMIT) {
    // Get oldest entries to remove (10% of capacity)
    const entriesToRemove = Math.ceil(CACHE_SIZE_LIMIT * 0.1);
    const keys = [...responseCache.keys()].slice(0, entriesToRemove);
    keys.forEach(key => responseCache.delete(key));
  }
  
  responseCache.set(key, {
    value,
    timestamp: Date.now()
  });
}

/**
 * Get an item from cache if it exists and is not expired
 * @param {string} key - Cache key
 * @returns {Object|null} Cached value or null if not found/expired
 */
function getFromCache(key) {
  const cached = responseCache.get(key);
  
  if (!cached) {
    return null;
  }
  
  // Check if cache entry is expired
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    responseCache.delete(key);
    return null;
  }
  
  metrics.cacheHits++;
  return cached.value;
}

/**
 * Generate a cache key for a transaction
 * @param {string} description - Transaction description
 * @param {number} amount - Transaction amount
 * @param {string} type - Transaction type
 * @returns {string} Cache key
 */
function generateCacheKey(description, amount, type) {
  return `${description}_${amount}_${type}`.toLowerCase();
}

/**
 * Categorize a transaction using OpenAI
 * @param {string} description - Transaction description
 * @param {number} amount - Transaction amount
 * @param {string} type - Transaction type (income or expense)
 * @param {Array} existingCategories - Array of existing categories
 * @returns {Promise<Object>} Object containing suggested category and confidence
 */
async function categorizeTransaction(description, amount, type = 'expense', existingCategories = []) {
  // Check if OpenAI is available
  if (!isAvailable()) {
    console.log(`[OpenAI] API not available for transaction: "${description}"`);
    return {
      categoryName: null,
      confidence: 0,
      reasoning: "OpenAI API not available. Please configure your OPENAI_API_KEY.",
      error: true,
      errorType: "api_not_configured"
    };
  }

  // Create cache key - normalize to avoid case sensitivity issues
  const cacheKey = generateCacheKey(description, amount, type);
  
  // Check cache first
  const cachedResult = getFromCache(cacheKey);
  if (cachedResult) {
    console.log(`[OpenAI] Cache hit for transaction: "${description}"`);
    return {
      ...cachedResult,
      fromCache: true
    };
  }
  
  try {
    console.log(`[OpenAI] Categorizing transaction: "${description}" for $${amount} (${type})`);
    metrics.apiCalls++;
    
    // Prepare system instruction with existing categories if available
    let systemContent = "You are a financial transaction categorizer. Analyze the transaction and provide a category.";
    
    if (existingCategories && existingCategories.length > 0) {
      // Format categories for the prompt
      const categoryOptions = existingCategories
        .filter(cat => cat.type === type || type === 'unknown') // Only include relevant category types
        .map(cat => `- ${cat.name} (${cat.type})`)
        .join('\n');
      
      if (categoryOptions) {
        systemContent += `\n\nPlease categorize into one of these existing categories:\n${categoryOptions}\n\nIf none fit well, suggest a new category name.`;
      }
    }

    // Add instruction to return as JSON
    systemContent += "\n\nRespond with a JSON object containing:\n1. category: The suggested category name\n2. confidence: Your confidence score (0.0-1.0) in this categorization\n3. reasoning: Brief explanation for why this category fits";

    // Create the API request configuration
    const requestConfig = {
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. Do not change this unless explicitly requested by the user
      messages: [{
        role: "system",
        content: systemContent
      }, {
        role: "user",
        content: `Categorize this ${type} transaction: "${description}" for $${amount}`
      }],
      temperature: 0.2, // Lower temperature for more consistent results
      max_tokens: 300,
      response_format: { type: "json_object" } // Ensure response is formatted as JSON
    };
    
    // Make API call with retry logic
    const completion = await callWithRetry(
      async () => {
        if (!openai) {
          throw new Error('OpenAI client not available');
        }
        return await openai.chat.completions.create(requestConfig);
      }
    );
    
    // Parse the JSON response
    const responseText = completion.choices[0].message.content.trim();
    console.log(`[OpenAI] Raw response: ${responseText}`);
    
    try {
      const response = JSON.parse(responseText);
      
      // Format and validate the response
      const result = {
        categoryName: response.category || null,
        confidence: parseFloat(response.confidence) || 0.5, // Default to medium confidence if missing
        reasoning: response.reasoning || "No reasoning provided",
        responseText // Include full response for debugging
      };

      // Find matching category ID if existing categories were provided
      if (result.categoryName && existingCategories && existingCategories.length > 0) {
        const matchResult = findMatchingCategory(
          result.categoryName,
          existingCategories,
          type
        );
        
        result.categoryId = matchResult.categoryId;
        result.matchConfidence = matchResult.matchConfidence;
        
        console.log(`[OpenAI] Category match: "${result.categoryName}" → ID: ${result.categoryId}, Confidence: ${result.matchConfidence?.toFixed(2) || 'N/A'}`);
      }
      
      // Add to cache
      addToCache(cacheKey, result);
      
      return result;
    } catch (parseError) {
      console.error('[OpenAI] Failed to parse JSON response:', parseError);
      metrics.errors++;
      // Fallback to basic extraction in case of JSON parsing failure
      const result = {
        categoryName: responseText.split('\n')[0],
        confidence: 0.3,
        reasoning: "Error parsing structured response",
        responseText
      };
      
      // Even with parsing error, cache the result to avoid repeated API calls
      addToCache(cacheKey, result);
      
      return result;
    }
  } catch (error) {
    console.error('[OpenAI] API Error:', error);
    
    // Update error metrics
    metrics.errors++;
    metrics.lastError = error.message;
    metrics.lastErrorTime = Date.now();
    
    // Classify error type for better metrics
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      metrics.timeoutErrors++;
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      metrics.connectionErrors++;
    }
    
    // Return detailed error info
    return {
      categoryName: null,
      confidence: 0,
      reasoning: `Error: ${error.message}`,
      error: true,
      errorType: error.message.includes('timeout') ? 'timeout' : 
                 error.message.includes('rate limit') ? 'rate_limit' : 
                 error.name === 'SyntaxError' ? 'parse_error' : 'api_error',
      retryable: !error.message.includes('invalid_api_key') && 
                 !error.message.includes('not available')
    };
  }
}

/**
 * Find the best matching category ID from existing categories
 * @param {string} suggestedName - Suggested category name from OpenAI
 * @param {Array} existingCategories - List of existing categories
 * @param {string} transactionType - Transaction type (income or expense)
 * @returns {Object} Object with categoryId and matchConfidence
 */
/**
 * Find matching category from a suggested name
 * @param {string} suggestedName - The category name suggested by OpenAI
 * @param {Array} existingCategories - Array of existing category objects
 * @param {string} transactionType - The transaction type (expense, income, transfer)
 * @returns {Object} Object with categoryId and matchConfidence
 */
function findMatchingCategory(suggestedName, existingCategories, transactionType) {
  if (!suggestedName || !existingCategories || !existingCategories.length) {
    console.log(`[OpenAI] Cannot match category: Invalid inputs`);
    return { categoryId: null, matchConfidence: 0 };
  }
  
  // Handle cases where OpenAI returns "Category (type)" format
  // Extract the category name without the type in parentheses
  let cleanSuggestion = suggestedName;
  const typeMatch = suggestedName.match(/^(.+?)\s*\((expense|income|transfer)\)$/i);
  
  if (typeMatch) {
    cleanSuggestion = typeMatch[1].trim();
    // If a type was specified in parentheses, use it instead of the passed transactionType
    const specifiedType = typeMatch[2].toLowerCase();
    if (specifiedType && ['expense', 'income', 'transfer'].includes(specifiedType)) {
      transactionType = specifiedType;
    }
  }
  
  console.log(`[OpenAI] Matching "${suggestedName}" → Clean: "${cleanSuggestion}", Type: ${transactionType}`);
  
  // Normalize the suggested name for better matching
  const normalizedSuggestion = cleanSuggestion.toLowerCase();
  
  // First try to find an exact match
  const exactMatch = existingCategories.find(
    cat => cat.name.toLowerCase() === normalizedSuggestion &&
           (cat.type === transactionType || transactionType === 'unknown')
  );
  
  if (exactMatch) {
    console.log(`[OpenAI] Found exact match: ${exactMatch.name} (${exactMatch.type})`);
    return { categoryId: exactMatch.id, matchConfidence: 1.0 };
  }
  
  // Then try partial matches with the correct type
  const typeFilteredCategories = existingCategories.filter(
    cat => cat.type === transactionType || transactionType === 'unknown'
  );
  
  if (typeFilteredCategories.length === 0) {
    console.log(`[OpenAI] No categories found with type ${transactionType}`);
    // If no categories of the right type exist, try all categories
    typeFilteredCategories.push(...existingCategories);
  }
  
  // Calculate similarity scores
  const matches = typeFilteredCategories.map(category => {
    const categoryName = category.name.toLowerCase();
    
    // Check if one is a substring of another
    if (categoryName.includes(normalizedSuggestion) || normalizedSuggestion.includes(categoryName)) {
      const lengthRatio = Math.min(categoryName.length, normalizedSuggestion.length) / 
                          Math.max(categoryName.length, normalizedSuggestion.length);
      
      return {
        category,
        score: 0.7 + (0.3 * lengthRatio)
      };
    }
    
    // Calculate word overlap
    const catWords = new Set(categoryName.split(/\s+/));
    const sugWords = new Set(normalizedSuggestion.split(/\s+/));
    const intersection = [...catWords].filter(word => sugWords.has(word));
    
    if (intersection.length > 0) {
      const overlapScore = intersection.length / Math.max(catWords.size, sugWords.size);
      return {
        category,
        score: 0.5 + (0.4 * overlapScore)
      };
    }
    
    // Default low similarity score
    return {
      category,
      score: 0.1
    };
  });
  
  // Sort by score descending and get best match
  matches.sort((a, b) => b.score - a.score);
  
  if (matches.length > 0 && matches[0].score > 0.3) {
    const bestMatch = matches[0];
    console.log(`[OpenAI] Best category match: ${bestMatch.category.name} (${bestMatch.category.type}) with score ${bestMatch.score.toFixed(2)}`);
    return {
      categoryId: bestMatch.category.id,
      matchConfidence: bestMatch.score
    };
  }
  
  console.log(`[OpenAI] No good category matches found for "${suggestedName}"`);
  return { categoryId: null, matchConfidence: 0 };
}

/**
 * Categorize multiple transactions in a batch to minimize OpenAI API calls
 * @param {Array} transactions - Array of transaction objects (each with description, amount, type)
 * @param {Array} existingCategories - Array of existing categories
 * @returns {Promise<Array>} Array of categorization results
 */
async function categorizeBatch(transactions, existingCategories = []) {
  if (!transactions || transactions.length === 0) {
    return [];
  }
  
  // Check if OpenAI is available
  if (!isAvailable()) {
    console.log(`[OpenAI] API not available for batch categorization of ${transactions.length} transactions`);
    return transactions.map(transaction => ({
      transactionId: transaction.id,
      categoryName: null,
      confidence: 0,
      reasoning: "OpenAI API not available. Please configure your OPENAI_API_KEY.",
      error: true,
      errorType: "api_not_configured"
    }));
  }
  
  console.log(`[OpenAI] Batch categorizing ${transactions.length} transactions`);
  metrics.batchRequests++;
  
  // Process in smaller batches of up to 10 transactions to avoid token limits
  const BATCH_SIZE = 10;
  const results = [];
  
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    console.log(`[OpenAI] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(transactions.length/BATCH_SIZE)}`);
    
    try {
      // Format transactions for the prompt
      const formattedTransactions = batch.map((t, idx) => 
        `Transaction ${idx + 1}: "${t.description}" for $${t.amount} (${t.type || 'expense'})`
      ).join('\n');
      
      // Prepare system instruction with existing categories
      let systemContent = "You are a financial transaction categorizer. Analyze each transaction and provide a category.";
      
      if (existingCategories && existingCategories.length > 0) {
        // Format categories for the prompt
        const categoryOptions = existingCategories
          .map(cat => `- ${cat.name} (${cat.type})`)
          .join('\n');
        
        systemContent += `\n\nPlease categorize each transaction into one of these existing categories:\n${categoryOptions}\n\nIf none fit well, suggest a new category name.`;
      }
      
      // Instructions for response format
      systemContent += "\n\nRespond with a JSON array where each element corresponds to a transaction and contains:\n1. transactionIndex: The index of the transaction (starting at 0)\n2. category: The suggested category name\n3. confidence: Your confidence score (0.0-1.0) in this categorization\n4. reasoning: Brief explanation for why this category fits";
      
      // Create the API request configuration
      const requestConfig = {
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. Do not change this unless explicitly requested by the user
        messages: [{
          role: "system",
          content: systemContent
        }, {
          role: "user",
          content: `Please categorize these transactions:\n\n${formattedTransactions}`
        }],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      };
      
      // Make API call with retry logic
      const completion = await callWithRetry(
        async () => {
          if (!openai) {
            throw new Error('OpenAI client not available');
          }
          return await openai.chat.completions.create(requestConfig);
        }
      );
      
      metrics.apiCalls++;
      
      // Parse the JSON response
      const responseText = completion.choices[0].message.content.trim();
      console.log(`[OpenAI] Batch response received with length ${responseText.length} chars`);
      
      try {
        const response = JSON.parse(responseText);
        
        // Process each transaction in the batch
        if (Array.isArray(response)) {
          // Directly handle array format
          for (const item of response) {
            const index = item.transactionIndex;
            
            if (index >= 0 && index < batch.length) {
              const transaction = batch[index];
              
              // Create cache key and store result
              const cacheKey = generateCacheKey(
                transaction.description, 
                transaction.amount, 
                transaction.type || 'expense'
              );
              
              const result = {
                categoryName: item.category,
                confidence: parseFloat(item.confidence) || 0.5,
                reasoning: item.reasoning || "No reasoning provided"
              };
              
              // Add to cache
              addToCache(cacheKey, result);
              
              // Add to results with transaction reference
              results.push({
                transactionId: transaction.id,
                ...result
              });
            }
          }
        } else if (response.results && Array.isArray(response.results)) {
          // Handle object with results array
          for (const item of response.results) {
            const index = item.transactionIndex;
            
            if (index >= 0 && index < batch.length) {
              const transaction = batch[index];
              
              // Create cache key and store result
              const cacheKey = generateCacheKey(
                transaction.description, 
                transaction.amount, 
                transaction.type || 'expense'
              );
              
              const result = {
                categoryName: item.category,
                confidence: parseFloat(item.confidence) || 0.5,
                reasoning: item.reasoning || "No reasoning provided"
              };
              
              // Add to cache
              addToCache(cacheKey, result);
              
              // Add to results with transaction reference
              results.push({
                transactionId: transaction.id,
                ...result
              });
            }
          }
        } else {
          // Handle individual fields at the top level - old format
          console.warn('[OpenAI] Batch response has unexpected format - missing array structure');
          
          // For each transaction, manually process
          for (let j = 0; j < batch.length; j++) {
            const transaction = batch[j];
            
            // Extract data from fields like "category0", "confidence0", etc.
            const categoryKey = `category${j}`;
            const confidenceKey = `confidence${j}`;
            const reasoningKey = `reasoning${j}`;
            
            if (response[categoryKey]) {
              const result = {
                categoryName: response[categoryKey],
                confidence: parseFloat(response[confidenceKey]) || 0.5,
                reasoning: response[reasoningKey] || "No reasoning provided"
              };
              
              // Create cache key and store result
              const cacheKey = generateCacheKey(
                transaction.description, 
                transaction.amount, 
                transaction.type || 'expense'
              );
              
              // Add to cache
              addToCache(cacheKey, result);
              
              // Add to results with transaction reference
              results.push({
                transactionId: transaction.id,
                ...result
              });
            }
          }
        }
      } catch (parseError) {
        console.error('[OpenAI] Failed to parse batch JSON response:', parseError);
        metrics.errors++;
        
        // Fallback: process each transaction individually
        console.log('[OpenAI] Falling back to individual processing for batch');
        
        for (const transaction of batch) {
          // Skip cache check here since we already did it before batch processing
          const result = await categorizeTransaction(
            transaction.description,
            transaction.amount,
            transaction.type || 'expense',
            existingCategories
          );
          
          results.push({
            transactionId: transaction.id,
            ...result
          });
        }
      }
    } catch (error) {
      console.error('[OpenAI] Batch processing error:', error);
      metrics.errors++;
      
      // Fallback: process each transaction individually
      console.log('[OpenAI] Falling back to individual processing after batch error');
      
      for (const transaction of batch) {
        // Check cache before individual processing
        const cacheKey = generateCacheKey(
          transaction.description, 
          transaction.amount, 
          transaction.type || 'expense'
        );
        
        const cachedResult = getFromCache(cacheKey);
        
        if (cachedResult) {
          results.push({
            transactionId: transaction.id,
            ...cachedResult,
            fromCache: true
          });
        } else {
          const result = await categorizeTransaction(
            transaction.description,
            transaction.amount,
            transaction.type || 'expense',
            existingCategories
          );
          
          results.push({
            transactionId: transaction.id,
            ...result
          });
        }
      }
    }
    
    // Short delay between batches to avoid rate limits
    if (i + BATCH_SIZE < transactions.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Match categories to IDs if needed
  const resultsWithCategoryIds = results.map(result => {
    if (result.categoryId) {
      return result; // Already has categoryId
    }
    
    // Find matching category
    const transactionIndex = transactions.findIndex(t => t.id === result.transactionId);
    const transaction = transactions[transactionIndex];
    
    if (transaction && result.categoryName) {
      const transactionType = transaction.type || 'expense';
      const { categoryId, matchConfidence } = findMatchingCategory(
        result.categoryName,
        existingCategories,
        transactionType
      );
      
      // Adjust confidence based on category match quality
      const finalConfidence = categoryId
        ? (result.confidence * 0.7) + (matchConfidence * 0.3)
        : result.confidence * 0.5; // Lower confidence if no match found
      
      return {
        ...result,
        categoryId,
        matchConfidence,
        confidence: finalConfidence
      };
    }
    
    return result;
  });
  
  return resultsWithCategoryIds;
}

/**
 * Check if we are currently rate limited or have exceeded quota or API is not configured
 * @returns {boolean} Whether requests should be blocked
 */
function isRateLimited() {
  // If OpenAI client is not available, treat as rate limited
  if (!openai) {
    console.log('[OpenAI] OpenAI client not available');
    return true;
  }
  
  // If simulating failure, always return true
  if (SIMULATE_FAILURE) {
    console.log('[OpenAI] Simulating API failure for testing');
    metrics.isRateLimited = true;
    return true;
  }
  
  // If we've seen a rate limit error recently, enforce a cooldown period
  if (metrics.lastRateLimitTime > 0) {
    const timeSinceLastRateLimit = Date.now() - metrics.lastRateLimitTime;
    if (timeSinceLastRateLimit < RATE_LIMIT_WINDOW) {
      // Still in the rate limit cooldown window
      console.log('[OpenAI] In rate limit cooldown period');
      return true;
    } else {
      // Reset rate limit status after cooldown
      console.log('[OpenAI] Resetting rate limit status after cooldown');
      metrics.lastRateLimitTime = 0;
      metrics.isRateLimited = false;
    }
  }
  
  return metrics.isRateLimited;
}

/**
 * Make an API call with retry logic for rate limits
 * @param {Function} apiFn - The API function to call
 * @param {Array} args - Arguments to pass to the API function
 * @returns {Promise<any>} The API response
 */
async function callWithRetry(apiFn, ...args) {
  let retryCount = 0;
  let lastError = null;
  
  // Check if OpenAI client is available
  if (!openai) {
    const error = new Error('OpenAI client not available');
    error.code = 'api_key_missing';
    error.type = 'configuration_error';
    throw error;
  }
  
  // Check if we're rate limited before even trying
  if (isRateLimited()) {
    console.log('[OpenAI] Currently rate limited, using fallback mechanism');
    const error = new Error('OpenAI API rate limited');
    error.code = 'rate_limited';
    error.type = 'api_restriction';
    throw error;
  }
  
  while (retryCount <= MAX_RETRIES) {
    try {
      // If not the first attempt, add delay with exponential backoff
      if (retryCount > 0) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1);
        console.log(`[OpenAI] Retry attempt ${retryCount}/${MAX_RETRIES} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
        metrics.retries++;
      }
      
      // Add timeout to prevent hanging requests
      const timeoutMs = 10000; // 10 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI request timed out after 10 seconds')), timeoutMs);
      });
      
      // Race the API call against the timeout
      return await Promise.race([
        apiFn(...args),
        timeoutPromise
      ]);
    } catch (error) {
      lastError = error;
      
      // Handle timeout errors
      if (error.message && error.message.includes('timed out')) {
        console.warn('[OpenAI] API request timed out, will retry');
        metrics.errors++;
        
        if (retryCount >= MAX_RETRIES) {
          console.warn(`[OpenAI] Exceeded max retries after timeout (${MAX_RETRIES})`);
          break;
        }
        
        retryCount++;
        continue;
      }
      
      // Check for rate limiting errors
      if (error.status === 429 || 
          (error.error && (error.error.type === 'insufficient_quota' || 
                         error.error.code === 'insufficient_quota'))) {
        console.warn('[OpenAI] Rate limit or quota exceeded');
        metrics.rateLimitErrors++;
        metrics.lastRateLimitTime = Date.now();
        metrics.isRateLimited = true;
        
        // Enhance error with additional information
        error.code = 'rate_limited';
        error.type = 'api_restriction';
        
        // Don't retry if we've exceeded our quota
        if (error.error && (error.error.type === 'insufficient_quota' || 
                          error.error.code === 'insufficient_quota')) {
          console.error('[OpenAI] Quota exceeded, will use fallback mechanisms until reset');
          break;
        }
        
        // If we've retried too many times already, give up
        if (retryCount >= MAX_RETRIES) {
          console.warn(`[OpenAI] Exceeded max retries (${MAX_RETRIES})`);
          break;
        }
        
        retryCount++;
      } else {
        // For other errors, don't retry
        console.error('[OpenAI] API error:', error);
        
        // Enhance error with additional information if possible
        if (!error.code) {
          error.code = 'api_error';
          error.type = 'api_error';
        }
        
        break;
      }
    }
  }
  
  // If we get here, all retries failed or non-retriable error
  throw lastError;
}

/**
 * Get OpenAI usage metrics
 * @returns {Object} Current metrics
 */
function getMetrics() {
  const runtimeMs = Date.now() - metrics.startTime;
  return {
    ...metrics,
    runtimeMs,
    runtimeMinutes: Math.round(runtimeMs / 60000 * 10) / 10,
    cacheSize: responseCache.size,
    cacheHitRate: metrics.apiCalls > 0 
      ? Math.round((metrics.cacheHits / (metrics.apiCalls + metrics.cacheHits)) * 100) 
      : 0,
    rateLimitErrors: metrics.rateLimitErrors,
    retries: metrics.retries,
    isCurrentlyRateLimited: isRateLimited()
  };
}

/**
 * Reset the metrics counter
 */
function resetMetrics() {
  metrics.apiCalls = 0;
  metrics.cacheHits = 0;
  metrics.batchRequests = 0;
  metrics.errors = 0;
  metrics.rateLimitErrors = 0;
  metrics.retries = 0;
  metrics.startTime = Date.now();
  metrics.connectionErrors = 0;
  metrics.timeoutErrors = 0;
  metrics.parseFailed = 0;
  metrics.successfulCalls = 0;
  // Keeping error tracking for debugging
  metrics.lastError = `Reset at ${new Date().toISOString()}`;
  metrics.lastErrorTime = Date.now();
  // Do not reset lastRateLimitTime to maintain rate limit status
}

/**
 * Clear the response cache
 */
function clearCache() {
  responseCache.clear();
  console.log('[OpenAI] Response cache cleared');
}

/**
 * Check if OpenAI service is available and properly configured
 * @param {boolean} forceCheck - If true, perform a more thorough check
 * @returns {boolean} Whether OpenAI is available
 */
function isAvailable(forceCheck = false) {
  // Quick check if simulation is enabled or no API key configured
  if (SIMULATE_FAILURE || !API_KEY_CONFIGURED) {
    return false;
  }
  
  // Basic check if not forcing a thorough check
  if (!forceCheck) {
    return isOpenAIConfigured() && !isRateLimited();
  }
  
  // More thorough check
  // Also check if we're currently rate limited
  if (isRateLimited()) {
    console.log('[OpenAI] Service is currently rate limited, considered unavailable');
    return false;
  }
  
  return !!openai;
}

/**
 * Get information about the OpenAI service status
 * @param {boolean} forceCheck - Whether to perform a thorough availability check
 * @returns {Object} Status information
 */
function getStatus(forceCheck = false) {
  // Do a thorough check for availability
  const available = isAvailable(forceCheck);
  
  return {
    available,
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    clientConfigured: isOpenAIConfigured(),
    simulatingFailure: SIMULATE_FAILURE,
    rateLimited: isRateLimited(),
    metricsSnapshot: getMetrics(),
    readyForUse: available && !isRateLimited(),
    lastError: metrics.lastError ? {
      time: metrics.lastErrorTime,
      message: metrics.lastError,
      secondsAgo: metrics.lastErrorTime ? 
        Math.round((Date.now() - metrics.lastErrorTime) / 1000) : null
    } : null
  };
}

module.exports = {
  categorizeTransaction,
  categorizeBatch,
  generateBatchSummary,
  findMatchingCategory,
  getMetrics,
  resetMetrics,
  clearCache,
  isRateLimited,
  callWithRetry,
  isAvailable,
  getStatus,
  isOpenAIConfigured
};
