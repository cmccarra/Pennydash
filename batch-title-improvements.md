# Batch Title Generation Improvements

## Current Implementation Analysis

The current server-side batch organization logic in `organizeIntoBatches()` in `transactions.sequelize.js` is already quite sophisticated, using:

1. Merchant grouping with exact merchant matches
2. Description similarity grouping with Jaro-Winkler string distance
3. Common word extraction for batch titles
4. Source and transaction type grouping
5. Date range formatting for batches

## Key Improvements to Consider

Based on our testing, we could enhance the batch title generation with these improvements:

### 1. Smart Batch Title Generation

The current implementation creates batches with useful metadata but could benefit from a unified title generation strategy:

```javascript
// Add this function to consistently generate batch titles
function generateBatchTitle(batchId, transactions, metadata = {}) {
  // Implementation similar to our test version
  // Use metadata.source, metadata.merchant, metadata.dateRange, etc.
}
```

### 2. Better Single Transaction Handling

For batches with only one transaction, create more descriptive titles:

```javascript
if (transactions.length === 1) {
  const tx = transactions[0];
  // Format like: "Merchant - Short description" 
  return `${tx.merchant || 'Payment'} - ${tx.description.substring(0, 30)}`;
}
```

### 3. Enhanced Common Word Detection

Improve the algorithm to find meaningful common words in descriptions:

```javascript
// More comprehensive list of stopwords
const excludeWords = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
  'from', 'by', 'as', 'of', 'payment', 'purchase', 'transaction', 'fee', 'charge',
  'paid', 'buy', 'bought', 'sold', 'pay', 'bill', 'invoice', 'order', 'online'
]);

// Look for words that appear in at least 50% of transactions
const threshold = descriptions.length * 0.5;
```

### 4. Formatted Currency in Statistics

Use proper currency formatting for amount display:

```javascript
// Format amounts with proper currency
function formatCurrency(amount, currencyCode = 'USD') {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: currencyCode 
  }).format(amount);
}
```

### 5. Consolidated Date Range Formatting

Create a consistent date range formatter:

```javascript
// Format date ranges in a user-friendly way
function getFormattedDateRange(dateRange) {
  // If same month: "March 2025"
  // If different months same year: "January - March 2025"
  // If different years: "December 2024 - January 2025"
}
```

### 6. More Detailed Batch Metadata

Enhance the batch metadata to include:

- Total amounts (income/expense)
- Transaction counts by type
- Dominant merchants
- Common words detected
- Category distribution (if available)

## Integration Plan

1. Add these enhancements to the server-side `organizeIntoBatches` function
2. Ensure all batch objects include consistent metadata
3. Use the `generateBatchTitle` function whenever a batch is created
4. Update the frontend to display rich batch information
5. Add batch filtering and sorting based on this enhanced metadata