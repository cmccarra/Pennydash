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
        transactions: group,
        metadata: {
          source: 'merchant',
          merchant,
          type,
          dateRange,
          summary: `${merchant} - ${type === 'income' ? 'Income' : 'Expenses'}`
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
      const keywordTitle = `${keywords.join(' ')} - ${type === 'income' ? 'Income' : 'Expenses'}`;

      batches.push({
        transactions: typeTransactions,
        metadata: {
          source: 'keywords',
          keywords,
          type,
          dateRange: getDateRange(typeTransactions),
          summary: keywordTitle
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
      const key = `batch_${type}_${yearMonth}`;

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

      const title = `${type === 'income' ? 'Income' : 'Expenses'} Transactions`;

      batches.push({
        transactions: group,
        metadata: {
          source: 'date',
          type,
          dateRange: getDateRange(group),
          summary: title
        }
      });
    });
  }

  return batches;
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

  // Format dates as strings
  return {
    from: earliestDate ? earliestDate.toISOString().split('T')[0] : null,
    to: latestDate ? latestDate.toISOString().split('T')[0] : null
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

  const fromDate = new Date(dateRange.from);
  const toDate = new Date(dateRange.to);

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

// Export functions for use in other modules
module.exports = {
  organizeIntoBatches,
  findCommonWords,
  getDateRange,
  getFormattedDateRange
};