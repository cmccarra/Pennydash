/**
 * API service for making HTTP requests to the backend
 */

// API base URL
const API_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:5000/api';

/**
 * Make a GET request to the API
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Additional options for the request
 * @returns {Promise} Promise with the response data
 */
export const fetchData = async (endpoint, options = {}) => {
  console.log(`🔍 [API] GET request to ${endpoint}`);

  try {
    // Add timeout mechanism for requests that might hang
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    const response = await fetch(`${API_URL}${endpoint}`, {
      signal: controller.signal,
      ...options
    });

    // Clear timeout once response is received
    clearTimeout(timeoutId);

    // Debug logging for issues
    console.log(`🔍 [API] Response status for ${endpoint}:`, response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
        console.error(`🔍 [API] Error response data:`, errorData);
      } catch (jsonError) {
        // Could not parse JSON response
        console.error(`🔍 [API] Could not parse error response as JSON:`, jsonError);
        // Try to get text response
        try {
          const textError = await response.text();
          console.error(`🔍 [API] Error response text:`, textError);
          if (textError) {
            errorMessage = textError;
          }
        } catch (textError) {
          console.error(`🔍 [API] Could not get error response text:`, textError);
        }
      }

      throw new Error(errorMessage);
    }

    try {
      const result = await response.json();

      // For batches endpoint, perform specific validation
      if (endpoint.includes('/uploads/') && endpoint.includes('/batches')) {
        console.log(`🔍 [API] Validating batches response:`, {
          batchCount: result?.batches?.length || 0,
          hasBatches: Array.isArray(result?.batches),
          hasStatistics: !!result?.statistics
        });

        // Add validation for batch structure
        if (result?.batches && Array.isArray(result.batches)) {
          const missingBatchIds = result.batches.filter(batch => !batch.batchId).length;
          if (missingBatchIds > 0) {
            console.warn(`⚠️ [API] Found ${missingBatchIds} batches without IDs in API response`);
          }
        }
      }

      return result;
    } catch (jsonError) {
      console.warn(`🔍 [API] No JSON in response from ${endpoint}:`, jsonError);
      // For endpoints that might not return JSON
      return { success: true };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`🔍 [API] Request to ${endpoint} timed out`);
      throw new Error(`Request timed out after ${options.timeout || 30000}ms`);
    }

    console.error(`🔍 [API] Error fetching ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Make a POST request to the API
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Data to send
 * @returns {Promise} Promise with the response data
 */
export const postData = async (endpoint, data) => {
  console.log(`🔍 [API] POST request to ${endpoint}`, data);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    // Debug logging for issues
    console.log(`🔍 [API] Response status for ${endpoint}:`, response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
        console.error(`🔍 [API] Error response data:`, errorData);
      } catch (jsonError) {
        // Could not parse JSON response
        console.error(`🔍 [API] Could not parse error response as JSON:`, jsonError);
        // Try to get text response
        try {
          const textError = await response.text();
          console.error(`🔍 [API] Error response text:`, textError);
          if (textError) {
            errorMessage = textError;
          }
        } catch (textError) {
          console.error(`🔍 [API] Could not get error response text:`, textError);
        }
      }

      throw new Error(errorMessage);
    }

    try {
      const result = await response.json();
      console.log(`🔍 [API] Successful response from ${endpoint}:`, result);
      return result;
    } catch (jsonError) {
      console.warn(`🔍 [API] No JSON in response from ${endpoint}:`, jsonError);
      // For endpoints that might not return JSON
      return { success: true };
    }
  } catch (error) {
    console.error(`🔍 [API] Error posting to ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Make a PUT request to the API
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Data to send
 * @returns {Promise} Promise with the response data
 */
export const putData = async (endpoint, data) => {
  console.log(`🔍 [API] PUT request to ${endpoint}`, data);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    // Debug logging for issues
    console.log(`🔍 [API] Response status for ${endpoint}:`, response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
        console.error(`🔍 [API] Error response data:`, errorData);
      } catch (jsonError) {
        // Could not parse JSON response
        console.error(`🔍 [API] Could not parse error response as JSON:`, jsonError);
        // Try to get text response
        try {
          const textError = await response.text();
          console.error(`🔍 [API] Error response text:`, textError);
          if (textError) {
            errorMessage = textError;
          }
        } catch (textError) {
          console.error(`🔍 [API] Could not get error response text:`, textError);
        }
      }

      throw new Error(errorMessage);
    }

    try {
      const result = await response.json();
      console.log(`🔍 [API] Successful response from ${endpoint}:`, result);
      return result;
    } catch (jsonError) {
      console.warn(`🔍 [API] No JSON in response from ${endpoint}:`, jsonError);
      // For endpoints that might not return JSON
      return { success: true };
    }
  } catch (error) {
    console.error(`🔍 [API] Error updating ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Make a DELETE request to the API
 * @param {string} endpoint - API endpoint
 * @returns {Promise} Promise with the response data
 */
export const deleteData = async (endpoint) => {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    return response.status === 204 ? null : await response.json();
  } catch (error) {
    console.error(`Error deleting ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Upload a file to the API
 * @param {string} endpoint - API endpoint
 * @param {File} file - File to upload
 * @returns {Promise} Promise with the response data
 */
export const uploadFile = async (endpoint, file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error uploading to ${endpoint}:`, error);
    throw error;
  }
};

// Transactions API
export const transactionsApi = {
  getAll: () => fetchData('/transactions'),
  getById: (id) => fetchData(`/transactions/${id}`),
  create: (data) => postData('/transactions', data),
  update: (id, data) => putData(`/transactions/${id}`, data),
  delete: (id) => deleteData(`/transactions/${id}`),
  upload: (file) => uploadFile('/transactions/upload', file),
  uploadFile: (formData) => uploadFile('/transactions/upload', formData),
  batchCategorize: (data) => postData('/transactions/batch-categorize', data),
  updateCategory: (transactionIds, categoryId) => postData('/transactions/batch-categorize', { transactionIds, categoryId }),
  suggestCategory: (id, confidenceThreshold) => fetchData(`/transactions/${id}/suggest-category${confidenceThreshold ? `?threshold=${confidenceThreshold}` : ''}`),
  findSimilar: (id, threshold) => fetchData(`/transactions/${id}/similar?threshold=${threshold}`),
  getUncategorized: () => fetchData('/transactions/filter/uncategorized'),
  getTransactionsNeedingReview: (confidenceThreshold, limit) => {
    let url = '/transactions/filter/needs-review';
    const params = [];

    if (confidenceThreshold) {
      params.push(`threshold=${confidenceThreshold}`);
    }

    if (limit) {
      params.push(`limit=${limit}`);
    }

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    return fetchData(url);
  },

  getBatchesNeedingEnrichment: (options = {}) => {
    let url = '/transactions/batches/needs-enrichment';
    const params = [];

    if (options.includeReviewNeeded) {
      params.push(`includeReviewNeeded=true`);
    }

    if (options.confidenceThreshold) {
      params.push(`confidenceThreshold=${options.confidenceThreshold}`);
    }

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    return fetchData(url);
  },

  // Enrichment flow APIs
  getUploadedBatches: (uploadId, options = {}) => {
    console.log(`🔍 [API] Getting batches for upload ${uploadId} with options:`, options);
    // Use a shorter timeout for batch retrieval by default (20 seconds)
    return fetchData(`/transactions/uploads/${uploadId}/batches`, { 
      timeout: options.timeout || 20000,
      ...options 
    });
  },

  batchEnrich: async (batchId, enrichData, retryConfig = { maxRetries: 2, timeout: 20000 }) => {
    console.log(`🔍 [API] Enriching batch ${batchId} with data:`, enrichData);

    const { maxRetries, timeout } = retryConfig;
    let retryCount = 0;
    let lastError = null;

    // Check if AI suggestions are requested
    if (enrichData.generateSuggestions) {
      console.log(`🧠 [API] Requesting AI category suggestions for batch ${batchId}`);
      // Use a longer timeout for AI processing
      retryConfig.timeout = Math.max(timeout, 30000);
    }

    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          // Exponential backoff between retries
          const delay = Math.pow(2, retryCount - 1) * 1000;
          console.log(`🔄 [API] Retry ${retryCount}/${maxRetries} for batch enrichment after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Create a controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), retryConfig.timeout);

        console.log(`⏱️ [API] Setting timeout for batch enrichment to ${retryConfig.timeout}ms`);

        const response = await fetch(`${API_URL}/transactions/batches/${batchId}/enrich`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichData),
          signal: controller.signal
        });

        // Clear timeout
        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `HTTP error ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            // If we can't parse JSON, try to get text
            try {
              const textError = await response.text();
              if (textError) errorMessage = textError;
            } catch (textError) {
              // Do nothing
            }
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();

        // Log AI suggestion results if available
        if (result.aiSuggestions) {
          if (result.autoApplied) {
            console.log(`✅ [API] AI automatically categorized batch with confidence: ${result.confidence}`);
          } else if (result.needsReview) {
            console.log(`🔍 [API] AI suggestions need review, top categories:`, 
              result.aiSuggestions.map(c => c.categoryId).join(', '));
          }
        }

        console.log(`✅ [API] Successfully enriched batch ${batchId}`);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`❌ [API] Error enriching batch ${batchId} (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);

        // For timeout errors, we want to retry
        if (error.name === 'AbortError') {
          console.warn(`⏱️ [API] Batch enrichment timed out after ${retryConfig.timeout}ms`);
          retryCount++;
          continue;
        }

        // For server errors (500s), retry
        if (error.message && error.message.includes('HTTP error 5')) {
          console.warn(`⚠️ [API] Server error, will retry`);
          retryCount++;
          continue;
        }

        // For other errors, only retry on network issues, not on 4xx client errors
        if (error.name !== 'TypeError' && error.message && !error.message.includes('HTTP error 4')) {
          retryCount++;
          continue;
        }

        // Client errors should fail immediately
        break;
      }
    }

    // All retries failed
    throw lastError;
  },

  completeBatch: (batchId) => postData(`/transactions/batches/${batchId}/complete`, {}),
  completeUpload: (uploadId) => postData(`/transactions/uploads/${uploadId}/complete`, {}),
  confirmUpload: (uploadId) => postData(`/transactions/uploads/${uploadId}/confirm`, {}),
  cancelUpload: (uploadId) => postData(`/transactions/uploads/${uploadId}/cancel`, {}),

  // Account info APIs
  updateAccountInfo: (uploadId, accountInfo) => putData(`/transactions/uploads/${uploadId}/account-info`, accountInfo),
  getUploadedFiles: (uploadId) => fetchData(`/transactions/uploads/${uploadId}/files`),

  // AI suggestion APIs
  generateCategorySuggestions: (batchId, confidenceThreshold = 0.7) => {
    return transactionsApi.batchEnrich(batchId, {
      generateSuggestions: true,
      confidenceThreshold
    }, { maxRetries: 3, timeout: 30000 });
  },

  // Review queue APIs
  getReviewQueue: (options = {}) => {
    const { page = 1, pageSize = 50, confidenceThreshold = 0.7 } = options;
    return fetchData(`/review-queue?page=${page}&limit=${pageSize}&confidenceThreshold=${confidenceThreshold}`);
  },

  // Mark a transaction as reviewed without updating its category
  markAsReviewed: async (transactionId) => {
    console.log(`🔍 [API] Marking transaction ${transactionId} as reviewed`);

    let retryCount = 0;
    const maxRetries = 3;
    const baseTimeout = 10000; // 10 seconds
    let lastError = null;

    // Try the operation with retries
    while (retryCount <= maxRetries) {
      try {
        // Add exponential backoff delay for retries
        if (retryCount > 0) {
          const delay = Math.min(Math.pow(2, retryCount - 1) * 1000, 10000);
          console.log(`🔄 [API] Retry ${retryCount}/${maxRetries} for marking transaction as reviewed after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Create a controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), baseTimeout);

        console.log(`⏱️ [API] Setting timeout for review action to ${baseTimeout}ms`);

        const response = await fetch(`${API_URL}/transactions/${transactionId}/reviewed`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewed: true }),
          signal: controller.signal
        });

        // Clear timeout
        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `HTTP error ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            // If we can't parse JSON, try to get text
            try {
              const textError = await response.text();
              if (textError) errorMessage = textError;
            } catch (textError) {
              // Do nothing
            }
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log(`✅ [API] Successfully marked transaction ${transactionId} as reviewed`);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`❌ [API] Error marking transaction ${transactionId} as reviewed (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);

        // For AbortError (timeout), retry
        if (error.name === 'AbortError') {
          console.warn(`⏱️ [API] Review operation timed out after ${baseTimeout}ms`);
          retryCount++;
          continue;
        }

        // For server errors (500s), retry
        if (error.message && error.message.includes('HTTP error 5')) {
          console.warn(`⚠️ [API] Server error, will retry`);
          retryCount++;
          continue;
        }

        // For other errors, only retry on network issues, not on 4xx client errors
        if (error.name === 'TypeError' || (error.message && !error.message.includes('HTTP error 4'))) {
          retryCount++;
          continue;
        }

        // Client errors should fail immediately
        break;
      }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('Failed to mark transaction as reviewed after multiple attempts');
  },

  // Update transaction including its reviewed status
  updateTransaction: async (id, data) => {
    console.log(`🔍 [API] Updating transaction ${id} with data:`, data);

    let retryCount = 0;
    const maxRetries = 3;
    const baseTimeout = 10000; // 10 seconds
    let lastError = null;

    // Try the operation with retries
    while (retryCount <= maxRetries) {
      try {
        // Add exponential backoff delay for retries
        if (retryCount > 0) {
          const delay = Math.min(Math.pow(2, retryCount - 1) * 1000, 10000);
          console.log(`🔄 [API] Retry ${retryCount}/${maxRetries} for updating transaction after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Create a controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), baseTimeout);

        console.log(`⏱️ [API] Setting timeout for transaction update to ${baseTimeout}ms`);

        const response = await fetch(`${API_URL}/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal
        });

        // Clear timeout
        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `HTTP error ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            // If we can't parse JSON, try to get text
            try {
              const textError = await response.text();
              if (textError) errorMessage = textError;
            } catch (textError) {
              // Do nothing
            }
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log(`✅ [API] Successfully updated transaction ${id}`);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`❌ [API] Error updating transaction ${id} (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);

        // For AbortError (timeout), retry
        if (error.name === 'AbortError') {
          console.warn(`⏱️ [API] Transaction update timed out after ${baseTimeout}ms`);
          retryCount++;
          continue;
        }

        // For server errors (500s), retry
        if (error.message && error.message.includes('HTTP error 5')) {
          console.warn(`⚠️ [API] Server error, will retry`);
          retryCount++;
          continue;
        }

        // For other errors, only retry on network issues, not on 4xx client errors
        if (error.name === 'TypeError' || (error.message && !error.message.includes('HTTP error 4'))) {
          retryCount++;
          continue;
        }

        // Client errors should fail immediately
        break;
      }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('Failed to update transaction after multiple attempts');
  }
};

// Categories API
export const categoriesApi = {
  getAll: () => fetchData('/categories'),
  getById: (id) => fetchData(`/categories/${id}`),
  create: (data) => postData('/categories', data),
  update: (id, data) => putData(`/categories/${id}`, data),
  delete: (id) => deleteData(`/categories/${id}`),
  getTransactions: (id) => fetchData(`/categories/${id}/transactions`)
};

// Reports API
export const reportsApi = {
  getDashboard: () => fetchData('/reports/dashboard'),
  getByCategory: () => fetchData('/reports/by-category'),
  getMonthlyTotals: () => fetchData('/reports/monthly-totals'),
  getIncomeVsExpenses: () => fetchData('/reports/income-vs-expenses'),
  getTopMerchants: (limit = 10) => fetchData(`/reports/top-merchants?limit=${limit}`),
  getCategorizationStatus: () => fetchData('/reports/categorization-status'),
  getSpendingTrends: (months = 6) => fetchData(`/reports/spending-trends?months=${months}`)
};

// Settings API
export const settingsApi = {
  get: () => fetchData('/settings'),
  update: (data) => putData('/settings', data)
};

// AI Status API for monitoring and configuring AI services
export const aiStatusApi = {
  // Get current AI services status
  getStatus: () => fetchData('/ai-status'),

  // Check if an OpenAI API key is valid (without saving it)
  checkApiKey: (apiKey) => postData('/ai-status/check-key', { apiKey }),

  // Configure an OpenAI API key for the current session
  configureApiKey: (apiKey) => postData('/ai-status/configure', { apiKey }),

  // Reset metrics for AI services
  resetMetrics: () => postData('/ai-status/reset-metrics', {}),

  // Clear the response cache
  clearCache: () => postData('/ai-status/clear-cache', {})
};