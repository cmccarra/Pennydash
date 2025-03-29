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
 * @returns {Promise} Promise with the response data
 */
export const fetchData = async (endpoint) => {
  try {
    const response = await fetch(`${API_URL}${endpoint}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
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
  suggestCategory: (id) => fetchData(`/transactions/${id}/suggest-category`),
  findSimilar: (id, threshold) => fetchData(`/transactions/${id}/similar?threshold=${threshold}`),
  getUncategorized: () => fetchData('/transactions/filter/uncategorized'),
  // Enrichment flow APIs
  getUploadedBatches: (uploadId) => fetchData(`/transactions/uploads/${uploadId}/batches`),
  batchEnrich: (batchId, enrichData) => putData(`/transactions/batches/${batchId}/enrich`, enrichData),
  completeBatch: (batchId) => postData(`/transactions/batches/${batchId}/complete`, {}),
  completeUpload: (uploadId) => postData(`/transactions/uploads/${uploadId}/complete`, {}),
  // Account info APIs
  updateAccountInfo: (uploadId, accountInfo) => putData(`/transactions/uploads/${uploadId}/account-info`, accountInfo),
  getUploadedFiles: (uploadId) => fetchData(`/transactions/uploads/${uploadId}/files`)
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
