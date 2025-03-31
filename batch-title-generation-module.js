/**
 * Batch title generation and organization module
 * Exports functions for generating batch titles and organizing transactions into batches
 */

/**
 * Generate a better title for a batch based on its metadata and transactions
 * @param {string} batchId - The ID of the batch
 * @param {Array} transactions - The transactions in the batch
 * @param {Object} metadata - Optional metadata about the batch
 * @returns {string} A human-readable title for the batch
 */
function generateBatchTitle(batchId, transactions, metadata = {}) {
  if (!transactions || transactions.length === 0) {
    return "Empty Batch";
  }
  
  // Extract key information
  const stats = calculateBatchStatistics(transactions);
  const dateRange = getFormattedDateRange(stats.dateRange);
  const hasMostlyIncomeTransactions = stats.totalIncome > stats.totalExpense;
  const isAllSameType = (stats.totalIncome === 0 || stats.totalExpense === 0) && stats.transactionCount > 0;
  const transactionType = hasMostlyIncomeTransactions ? 'Income' : 'Expenses';
  
  // CASE 1: Check for pattern in batch ID
  if (batchId.includes('_')) {
    const parts = batchId.split('_');
    
    // Check for "batch_income_2025-03" or "batch_expense_2025-03" pattern
    if (parts.length >= 3 && 
        parts[0] === 'batch' && 
        (parts[1] === 'income' || parts[1] === 'expense') && 
        parts[2].includes('-')) {
      
      const type = parts[1]; // income or expense
      const period = parts[2]; // YYYY-MM
      
      try {
        const year = period.split('-')[0];
        const month = period.split('-')[1];
        
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const monthName = monthNames[parseInt(month) - 1];
        return `${type === 'income' ? 'Income' : 'Expenses'} - ${monthName} ${year}`;
      } catch (e) {
        // If there's any error parsing the date, fall back to other methods
        console.log(`Error parsing batch ID date: ${e.message}`);
      }
    }
  }
  
  // CASE 2: Use metadata if provided
  if (metadata && metadata.source) {
    if (metadata.summary) {
      return metadata.summary;
    }
    
    if (metadata.merchant) {
      return `Transactions from ${metadata.merchant}`;
    }
    
    if (metadata.commonWords && metadata.commonWords.length > 0) {
      return `${metadata.commonWords.join(' ')} Transactions`;
    }
  }
  
  // CASE 3: Single transaction with merchant
  if (transactions.length === 1 && transactions[0].merchant) {
    return `${transactions[0].merchant} - ${transactions[0].description.substring(0, 30)}`;
  }
  
  // CASE 4: Check for dominant merchant
  const merchantCounts = countMerchants(transactions);
  const dominantMerchant = getDominantMerchant(merchantCounts, transactions.length);
  
  if (dominantMerchant) {
    return isAllSameType 
      ? `${dominantMerchant} - ${transactionType}`
      : `Transactions from ${dominantMerchant}`;
  }
  
  // CASE 5: Check for common words in descriptions
  const descriptions = transactions.map(tx => tx.description ? tx.description.toLowerCase() : '');
  const commonWords = findCommonWords(descriptions);
  
  if (commonWords.length > 0) {
    return isAllSameType
      ? `${commonWords.join(' ')} - ${transactionType}`
      : `${commonWords.join(' ')} Transactions`;
  }
  
  // CASE 6: Fall back to transaction type with date
  return isAllSameType
    ? `${transactionType} - ${dateRange}`
    : `Transactions from ${dateRange}`;
}

/**
 * Count merchants in transactions
 * @param {Array} transactions - Array of transactions
 * @returns {Object} Object with merchant counts
 */
function countMerchants(transactions) {
  const merchantCounts = {};
  
  transactions.forEach(tx => {
    if (tx.merchant) {
      merchantCounts[tx.merchant] = (merchantCounts[tx.merchant] || 0) + 1;
    }
  });
  
  return merchantCounts;
}

/**
 * Get dominant merchant if one exists
 * @param {Object} merchantCounts - Counts of merchants
 * @param {number} totalCount - Total number of transactions
 * @param {number} threshold - Threshold percentage (0-1) for dominance
 * @returns {string|null} Dominant merchant or null
 */
function getDominantMerchant(merchantCounts, totalCount, threshold = 0.5) {
  const sortedMerchants = Object.keys(merchantCounts).sort((a, b) => 
    merchantCounts[b] - merchantCounts[a]
  );
  
  if (sortedMerchants.length > 0 && 
      merchantCounts[sortedMerchants[0]] >= totalCount * threshold) {
    return sortedMerchants[0];
  }
  
  return null;
}

/**
 * Find common words across descriptions
 * @param {Array} descriptions - Array of transaction descriptions
 * @param {number} threshold - Threshold for commonality (0-1)
 * @returns {Array} Array of common words
 */
function findCommonWords(descriptions, threshold = 0.5) {
  const excludeWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
    'from', 'by', 'as', 'of', 'payment', 'purchase', 'transaction', 'fee', 'charge',
    'paid', 'buy', 'bought', 'sold', 'pay', 'bill', 'invoice', 'order', 'online'
  ]);
  
  // Extract words from descriptions
  const allWords = [];
  descriptions.forEach(desc => {
    if (!desc) return;
    
    const words = desc.split(/\s+/).filter(word => 
      word.length > 2 && !excludeWords.has(word.toLowerCase())
    );
    allWords.push(...words);
  });
  
  // Count word frequencies
  const wordCounts = {};
  allWords.forEach(word => {
    const lowerWord = word.toLowerCase();
    wordCounts[lowerWord] = (wordCounts[lowerWord] || 0) + 1;
  });
  
  // Find words that appear in at least threshold % of transactions
  const minOccurrences = Math.max(2, Math.ceil(descriptions.length * threshold));
  const commonWords = Object.keys(wordCounts)
    .filter(word => wordCounts[word] >= minOccurrences)
    .sort((a, b) => wordCounts[b] - wordCounts[a])
    .slice(0, 3);
  
  // Capitalize first letters
  return commonWords.map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  );
}

/**
 * Get date range from transactions
 * @param {Array} transactions - Array of transactions
 * @returns {Object} Object with from and to dates
 */
function getDateRange(transactions) {
  let earliestDate = null;
  let latestDate = null;
  
  transactions.forEach(tx => {
    if (!tx.date) return;
    
    const txDate = new Date(tx.date);
    if (!earliestDate || txDate < earliestDate) {
      earliestDate = txDate;
    }
    if (!latestDate || txDate > latestDate) {
      latestDate = txDate;
    }
  });
  
  return {
    from: earliestDate,
    to: latestDate
  };
}

/**
 * Format date range for display
 * @param {Object} dateRange - Object with from and to dates
 * @returns {string} Formatted date range string
 */
function getFormattedDateRange(dateRange) {
  if (!dateRange.from || !dateRange.to) {
    return "unknown dates";
  }
  
  const fromDate = dateRange.from;
  const toDate = dateRange.to;
  
  // Format: Month Year (if same month) or Month Year - Month Year (if different)
  const fromMonth = fromDate.getMonth();
  const fromYear = fromDate.getFullYear();
  const toMonth = toDate.getMonth();
  const toYear = toDate.getFullYear();
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  if (fromYear === toYear && fromMonth === toMonth) {
    return `${monthNames[fromMonth]} ${fromYear}`;
  } else if (fromYear === toYear) {
    return `${monthNames[fromMonth]} - ${monthNames[toMonth]} ${fromYear}`;
  } else {
    return `${monthNames[fromMonth]} ${fromYear} - ${monthNames[toMonth]} ${toYear}`;
  }
}

/**
 * Calculate batch statistics
 * @param {Array} transactions - Array of transactions
 * @returns {Object} Statistics object
 */
function calculateBatchStatistics(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  
  const dateRange = getDateRange(transactions);
  
  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount) || 0;
    
    if (tx.type === 'income') {
      totalIncome += amount;
      incomeCount++;
    } else {
      totalExpense += amount;
      expenseCount++;
    }
  });
  
  return {
    totalIncome,
    totalExpense,
    incomeCount,
    expenseCount,
    transactionCount: transactions.length,
    dateRange
  };
}

/**
 * Format amount for display
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code (default: USD)
 * @returns {string} Formatted amount
 */
function formatAmount(amount, currencyCode = 'USD') {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: currencyCode 
  }).format(amount);
}

/**
 * Organize transactions into logical batches
 * @param {Array} transactions - Transactions to organize
 * @returns {Array} Array of batch objects
 */
function organizeIntoBatches(transactions) {
  const MAX_BATCH_SIZE = 25; // Reasonable size for a batch
  const batchGroups = {};
  const processedTransactions = new Set();
  const batches = [];
  
  // STEP 1: Group by merchant + type where there's a dominant merchant
  const merchantGroups = {};
  
  transactions.forEach(tx => {
    if (!tx.merchant || !tx.date) return;
    
    const type = tx.type || 'expense';
    const merchant = tx.merchant;
    const key = `merchant_${type}_${merchant.replace(/\s+/g, '_')}`;
    
    if (!merchantGroups[key]) {
      merchantGroups[key] = [];
    }
    
    merchantGroups[key].push(tx);
  });
  
  // Process merchant groups
  Object.keys(merchantGroups).forEach(key => {
    const group = merchantGroups[key];
    // Only create merchant groups if we have enough similar transactions
    if (group.length >= 3) {
      // Mark these transactions as processed
      group.forEach(tx => processedTransactions.add(tx.id));
      
      // Extract key information
      const parts = key.split('_');
      const type = parts[1];
      const merchant = parts.slice(2).join(' ');
      
      // Get date range
      const dateRange = getDateRange(group);
      const formattedDateRange = getFormattedDateRange(dateRange);
      
      batches.push({
        batchId: key,
        title: `${merchant} - ${type === 'income' ? 'Income' : 'Expenses'}`,
        transactions: group,
        statistics: calculateBatchStatistics(group),
        metadata: {
          source: 'merchant',
          merchant,
          type,
          dateRange
        }
      });
    }
  });
  
  // STEP 2: Look for common words in descriptions
  const remainingByType = {
    income: transactions.filter(tx => tx.type === 'income' && !processedTransactions.has(tx.id)),
    expense: transactions.filter(tx => (tx.type !== 'income' || !tx.type) && !processedTransactions.has(tx.id))
  };
  
  // Process each type separately
  Object.keys(remainingByType).forEach(type => {
    // Get remaining transactions of this type
    const typeTransactions = remainingByType[type];
    
    if (typeTransactions.length === 0) return;
    
    // Look for keywords in descriptions
    const descriptions = typeTransactions.map(tx => tx.description ? tx.description.toLowerCase() : '');
    const keywords = findCommonWords(descriptions, 0.4);
    
    // If we found keywords, create a batch based on them
    if (keywords.length > 0) {
      const keywordBatchId = `keyword_${type}_${keywords[0].toLowerCase()}`;
      const keywordTitle = `${keywords.join(' ')} - ${type === 'income' ? 'Income' : 'Expenses'}`;
      
      batches.push({
        batchId: keywordBatchId,
        title: keywordTitle,
        transactions: typeTransactions,
        statistics: calculateBatchStatistics(typeTransactions),
        metadata: {
          source: 'keywords',
          keywords,
          type,
          dateRange: getDateRange(typeTransactions)
        }
      });
      
      // Mark these as processed
      typeTransactions.forEach(tx => processedTransactions.add(tx.id));
    }
  });
  
  // STEP 3: Organize remaining by source, type, and date
  const finalRemaining = transactions.filter(tx => !processedTransactions.has(tx.id));
  
  if (finalRemaining.length > 0) {
    const sourceGroups = {};
    
    // Group by source
    finalRemaining.forEach(tx => {
      if (!tx.date) return;
      
      const source = tx.source || 'unknown';
      const type = tx.type || 'expense';
      const date = new Date(tx.date);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const key = `batch_${type}_${source}_${yearMonth}`;
      
      if (!sourceGroups[key]) {
        sourceGroups[key] = [];
      }
      
      sourceGroups[key].push(tx);
    });
    
    // Convert to batches
    Object.keys(sourceGroups).forEach(key => {
      const group = sourceGroups[key];
      
      // Extract parts from the key
      const parts = key.split('_');
      const type = parts[1]; // income or expense
      const source = parts[2]; // source
      const yearMonth = parts[3]; // YYYY-MM
      
      // Extract year and month
      const year = yearMonth.split('-')[0];
      const month = yearMonth.split('-')[1];
      
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      const monthName = monthNames[parseInt(month) - 1];
      const title = `${type === 'income' ? 'Income' : 'Expenses'} - ${monthName} ${year}`;
      
      batches.push({
        batchId: key,
        title,
        transactions: group,
        statistics: calculateBatchStatistics(group),
        metadata: {
          source: 'date',
          type,
          sourceType: source,
          dateRange: getDateRange(group)
        }
      });
    });
  }
  
  return batches;
}

// Export functions for use in other modules
module.exports = {
  generateBatchTitle,
  organizeIntoBatches,
  calculateBatchStatistics,
  formatAmount,
  findCommonWords,
  getDateRange,
  getFormattedDateRange
};