
const OpenAI = require('openai');

// Configure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Tracking metrics and cache to optimize API usage
const metrics = {
  apiCalls: 0,
  cacheHits: 0,
  batchRequests: 0,
  errors: 0,
  startTime: Date.now()
};

// Simple in-memory cache for OpenAI responses
// Key: transaction description + amount + type
// Value: categorization response
const responseCache = new Map();

// Cache size limit (items)
const CACHE_SIZE_LIMIT = 1000;

// Cache TTL (24 hours in milliseconds)
const CACHE_TTL = 24 * 60 * 60 * 1000;

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

    const completion = await openai.chat.completions.create({
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
    });
    
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
    metrics.errors++;
    return {
      categoryName: null,
      confidence: 0,
      reasoning: `Error: ${error.message}`,
      error: true
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
function findMatchingCategory(suggestedName, existingCategories, transactionType) {
  if (!suggestedName || !existingCategories || !existingCategories.length) {
    return { categoryId: null, matchConfidence: 0 };
  }
  
  // Normalize the suggested name for better matching
  const normalizedSuggestion = suggestedName.toLowerCase();
  
  // First try to find an exact match
  const exactMatch = existingCategories.find(
    cat => cat.name.toLowerCase() === normalizedSuggestion &&
           (cat.type === transactionType || transactionType === 'unknown')
  );
  
  if (exactMatch) {
    return { categoryId: exactMatch.id, matchConfidence: 1.0 };
  }
  
  // Then try partial matches with the correct type
  const typeFilteredCategories = existingCategories.filter(
    cat => cat.type === transactionType || transactionType === 'unknown'
  );
  
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
    return {
      categoryId: matches[0].category.id,
      matchConfidence: matches[0].score
    };
  }
  
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
      
      const completion = await openai.chat.completions.create({
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
      });
      
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
      : 0
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
  metrics.startTime = Date.now();
}

/**
 * Clear the response cache
 */
function clearCache() {
  responseCache.clear();
  console.log('[OpenAI] Response cache cleared');
}

module.exports = {
  categorizeTransaction,
  categorizeBatch,
  findMatchingCategory,
  getMetrics,
  resetMetrics,
  clearCache
};
