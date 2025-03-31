/**
 * Enhanced batch title generation
 * 
 * This implementation includes more sophisticated title generation
 * based on batch characteristics including:
 * - Date range formatting
 * - Merchant detection
 * - Common word analysis in descriptions
 * - Transaction type (income/expense) detection
 * - Amount statistics
 */

// Sample test data
const testBatches = [
  {
    id: 'merchant_batch',
    transactions: [
      { id: '1', date: '2025-03-15', description: 'Coffee at Starbucks', merchant: 'Starbucks', amount: 5.75, type: 'expense' },
      { id: '2', date: '2025-03-16', description: 'Coffee and pastry', merchant: 'Starbucks', amount: 8.45, type: 'expense' },
      { id: '3', date: '2025-03-17', description: 'Lunch meeting', merchant: 'Starbucks', amount: 15.99, type: 'expense' },
      { id: '4', date: '2025-03-18', description: 'Morning coffee', merchant: 'Starbucks', amount: 4.50, type: 'expense' }
    ]
  },
  {
    id: 'grocery_batch',
    transactions: [
      { id: '5', date: '2025-03-01', description: 'Grocery shopping', merchant: 'Whole Foods', amount: 85.45, type: 'expense' },
      { id: '6', date: '2025-03-08', description: 'Weekly grocery run', merchant: 'Trader Joe\'s', amount: 65.22, type: 'expense' },
      { id: '7', date: '2025-03-15', description: 'Grocery and household items', merchant: 'Target', amount: 125.87, type: 'expense' },
      { id: '8', date: '2025-03-22', description: 'Monthly grocery stock-up', merchant: 'Costco', amount: 245.33, type: 'expense' }
    ]
  },
  {
    id: 'batch_income_2025-03',
    transactions: [
      { id: '9', date: '2025-03-15', description: 'Paycheck Deposit', merchant: 'Employer', amount: 1500.00, type: 'income' },
      { id: '10', date: '2025-03-30', description: 'Consulting Fee', merchant: 'Client A', amount: 750.00, type: 'income' }
    ]
  },
  {
    id: 'mixed_batch',
    transactions: [
      { id: '11', date: '2025-03-05', description: 'Movie tickets', merchant: 'AMC Theaters', amount: 24.50, type: 'expense' },
      { id: '12', date: '2025-03-12', description: 'Book purchase', merchant: 'Amazon', amount: 15.99, type: 'expense' },
      { id: '13', date: '2025-03-18', description: 'Concert tickets', merchant: 'Ticketmaster', amount: 85.00, type: 'expense' },
      { id: '14', date: '2025-03-25', description: 'Magazine subscription', merchant: 'NY Times', amount: 12.99, type: 'expense' }
    ]
  },
  {
    id: 'single_transaction_batch',
    transactions: [
      { id: '15', date: '2025-03-31', description: 'Rent payment', merchant: 'ABC Properties', amount: 1200.00, type: 'expense' }
    ]
  },
  {
    id: 'utilities_batch',
    transactions: [
      { id: '16', date: '2025-03-05', description: 'Electricity bill', merchant: 'Power Company', amount: 45.67, type: 'expense' },
      { id: '17', date: '2025-03-10', description: 'Water bill payment', merchant: 'Water Utility', amount: 28.99, type: 'expense' },
      { id: '18', date: '2025-03-15', description: 'Internet service', merchant: 'ISP Provider', amount: 59.99, type: 'expense' },
      { id: '19', date: '2025-03-20', description: 'Cell phone bill', merchant: 'Mobile Carrier', amount: 75.00, type: 'expense' }
    ]
  }
];

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
  // First, separate transactions by type and month
  const batchGroups = {};
  
  transactions.forEach(tx => {
    if (!tx.date) return;
    
    const date = new Date(tx.date);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const batchKey = `batch_${tx.type}_${yearMonth}`;
    
    if (!batchGroups[batchKey]) {
      batchGroups[batchKey] = [];
    }
    
    batchGroups[batchKey].push(tx);
  });
  
  // Convert to array of batch objects with title and metadata
  return Object.keys(batchGroups).map(batchId => {
    const transactions = batchGroups[batchId];
    const stats = calculateBatchStatistics(transactions);
    
    // Generate a meaningful title based on the batch contents
    const title = generateBatchTitle(batchId, transactions);
    
    return {
      batchId,
      title,
      transactions,
      statistics: stats
    };
  });
}

/**
 * Test batch title generation
 */
function runTests() {
  console.log('===== ENHANCED BATCH TITLE GENERATION =====\n');
  
  testBatches.forEach((batch, index) => {
    const title = generateBatchTitle(batch.id, batch.transactions);
    const stats = calculateBatchStatistics(batch.transactions);
    
    console.log(`\n== Batch ${index + 1}: ${batch.id} ==`);
    console.log(`Title: "${title}"`);
    console.log(`Transactions: ${stats.transactionCount}`);
    console.log(`Income: ${formatAmount(stats.totalIncome)} (${stats.incomeCount} transactions)`);
    console.log(`Expenses: ${formatAmount(stats.totalExpense)} (${stats.expenseCount} transactions)`);
    
    const dateRangeStr = stats.dateRange.from && stats.dateRange.to 
      ? `${stats.dateRange.from.toISOString().split('T')[0]} to ${stats.dateRange.to.toISOString().split('T')[0]}`
      : 'unknown';
    console.log(`Date range: ${dateRangeStr}`);
    
    console.log('\nSample transactions:');
    batch.transactions.slice(0, 2).forEach((tx, txIndex) => {
      console.log(`  ${txIndex + 1}. ${tx.description} - ${formatAmount(tx.amount)} (${tx.type})`);
    });
    
    console.log('\n----------------------------------');
  });
  
  console.log('\n===== TESTING BATCH ORGANIZATION =====\n');
  
  // Flatten all transactions into a single array
  const allTransactions = testBatches.reduce((acc, batch) => {
    return acc.concat(batch.transactions);
  }, []);
  
  const organizedBatches = organizeIntoBatches(allTransactions);
  
  console.log(`Organized ${allTransactions.length} transactions into ${organizedBatches.length} batches:\n`);
  
  organizedBatches.forEach((batch, index) => {
    console.log(`\n== Organized Batch ${index + 1}: ${batch.batchId} ==`);
    console.log(`Title: "${batch.title}"`);
    console.log(`Transactions: ${batch.transactions.length}`);
    console.log(`Income: ${formatAmount(batch.statistics.totalIncome)}`);
    console.log(`Expenses: ${formatAmount(batch.statistics.totalExpense)}`);
    
    const dateRangeStr = batch.statistics.dateRange.from && batch.statistics.dateRange.to 
      ? `${batch.statistics.dateRange.from.toISOString().split('T')[0]} to ${batch.statistics.dateRange.to.toISOString().split('T')[0]}`
      : 'unknown';
    console.log(`Date range: ${dateRangeStr}`);
    
    console.log('\n----------------------------------');
  });
}

// Run the tests
runTests();