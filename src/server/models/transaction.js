/**
 * Transaction model representing a financial transaction
 */
const crypto = require('crypto');

class Transaction {
  constructor(data) {
    this.id = data.id || crypto.randomUUID();
    
    // Handle date formats
    let parsedDate;
    if (data.date) {
      try {
        // Handle "DD MMM YYYY" format (e.g., "02 Oct 2024")
        if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(data.date)) {
          const parts = data.date.split(' ');
          const day = parts[0].padStart(2, '0');
          const month = {
            Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
            Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
          }[parts[1]];
          const year = parts[2];
          parsedDate = `${year}-${month}-${day}`;
        } 
        // Handle "MM/DD/YYYY" format
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(data.date)) {
          const parts = data.date.split('/');
          parsedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
        // Handle "DD/MM/YYYY" format
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(data.date)) {
          const parts = data.date.split('/');
          parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        // Try to use direct ISO conversion for YYYY-MM-DD and similar formats
        else {
          const dateObj = new Date(data.date);
          if (!isNaN(dateObj.getTime())) {
            parsedDate = dateObj.toISOString().split('T')[0];
          } else {
            // If all parsing fails, use today's date
            parsedDate = new Date().toISOString().split('T')[0];
            console.warn(`Could not parse date '${data.date}', using current date`);
          }
        }
      } catch (e) {
        console.error(`Error parsing date ${data.date}:`, e);
        parsedDate = new Date().toISOString().split('T')[0];
      }
    } else {
      parsedDate = new Date().toISOString().split('T')[0];
    }
    
    this.date = parsedDate;
    this.description = data.description || '';
    this.amount = parseFloat(data.amount) || 0;
    this.type = data.type || 'expense'; // 'expense' or 'income'
    this.categoryId = data.categoryId || null;
    this.account = data.account || '';
    this.accountType = data.accountType || ''; // 'bank', 'credit_card', 'wallet', 'other'
    this.merchant = data.merchant || ''; // Extracted from description if available
    this.notes = data.notes || '';
    this.balance = data.balance || null; // Account balance after transaction (if available)
    this.reference = data.reference || null; // Transaction ID or reference number
    this.currency = data.currency || 'USD'; // Default to USD
    this.source = data.source || 'manual'; // 'manual', 'csv', 'xml', 'pdf', 'xlsx', etc.
    this.sourceFileName = data.sourceFileName || null;
    this.importSource = data.importSource || data.sourceFileName || null;
    this.batchId = data.batchId || null;
    this.uploadId = data.uploadId || null;
    this.enrichmentStatus = data.enrichmentStatus || 'pending';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Validate transaction data
  static validate(data) {
    const errors = [];

    if (!data.date) {
      errors.push('Date is required');
    } else if (isNaN(new Date(data.date).getTime())) {
      errors.push('Invalid date format');
    }

    if (!data.description) {
      errors.push('Description is required');
    }

    if (data.amount === undefined || data.amount === null) {
      errors.push('Amount is required');
    } else if (isNaN(parseFloat(data.amount))) {
      errors.push('Amount must be a number');
    }

    if (data.type && !['expense', 'income'].includes(data.type)) {
      errors.push('Type must be either "expense" or "income"');
    }

    return errors;
  }

  // Create a normalized Transaction object from CSV row data
  static fromCSV(csvRow) {
    console.log('Processing CSV row:', JSON.stringify(csvRow));
    
    // Default mapping assuming standard columns
    const mapping = {
      date: csvRow['Date'] || csvRow['date'] || csvRow['DATE'] || csvRow['Transaction Date'] || 
            csvRow['TransactionDate'] || csvRow['TRANSACTION_DATE'] || csvRow['Date Processed'] || 
            csvRow['DateProcessed'] || csvRow['Date Posted'] || csvRow['PostingDate'] || '',
      description: csvRow['Description'] || csvRow['description'] || csvRow['DESC'] || csvRow['Memo'] || 
                  csvRow['MEMO'] || csvRow['DESCRIPTION'] || csvRow['Transaction Description'] || 
                  csvRow['Details'] || '',
      amount: csvRow['Amount'] || csvRow['amount'] || csvRow['AMOUNT'] || csvRow['Value'] || 
              csvRow['VALUE'] || csvRow['TRANSACTION_AMOUNT'] || csvRow['Debit'] || csvRow['Credit'] || 0,
      type: undefined, // Will be determined based on amount value after preprocessing
      account: csvRow['Account'] || csvRow['account'] || csvRow['ACCOUNT'] || csvRow['AccountName'] || 
               csvRow['ACCOUNT_NAME'] || csvRow['Bank'] || csvRow['BankName'] || '',
      accountType: csvRow['AccountType'] || csvRow['accountType'] || csvRow['ACCOUNT_TYPE'] || 
                  csvRow['Account Type'] || '',
      merchant: csvRow['Merchant'] || csvRow['merchant'] || csvRow['MERCHANT'] || csvRow['Payee'] || 
               csvRow['PAYEE'] || csvRow['Vendor'] || '',
      balance: csvRow['Balance'] || csvRow['balance'] || csvRow['BALANCE'] || csvRow['RUNNING_BALANCE'] || 
               csvRow['Available Balance'] || null,
      reference: csvRow['Reference'] || csvRow['reference'] || csvRow['REF'] || csvRow['REFERENCE'] || 
                csvRow['TransactionId'] || csvRow['TRANSACTION_ID'] || null,
      currency: csvRow['Currency'] || csvRow['currency'] || csvRow['CURRENCY'] || 'USD'
    };

    // Process the amount to ensure it's a proper number
    let amount = parseFloat(mapping.amount.toString().replace(/[^\d.-]/g, ''));
    
    // Convert negative values to positive for expenses
    if (mapping.type === 'expense' && amount < 0) {
      amount = Math.abs(amount);
    }

    // Process balance if available
    let balance = null;
    if (mapping.balance) {
      try {
        balance = parseFloat(mapping.balance.toString().replace(/[^\d.-]/g, ''));
      } catch (err) {
        console.warn('Could not parse balance field:', err);
      }
    }

    // If merchant isn't specified, try to extract it from description
    let merchant = mapping.merchant;
    if (!merchant && mapping.description) {
      // Extract first few words as merchant (simple approach)
      merchant = mapping.description.split(' ').slice(0, 2).join(' ');
    }

    // Determine account type if not specified
    let accountType = mapping.accountType;
    if (!accountType) {
      // Try to determine account type from account name or other fields
      const accountLower = mapping.account.toLowerCase();
      if (accountLower.includes('credit') || accountLower.includes('card')) {
        accountType = 'credit_card';
      } else if (accountLower.includes('check') || accountLower.includes('saving') || accountLower.includes('bank')) {
        accountType = 'bank';
      } else if (accountLower.includes('paypal') || accountLower.includes('venmo') || accountLower.includes('wallet')) {
        accountType = 'wallet';
      } else {
        accountType = 'other';
      }
    }

    // For credit card transactions, we need special handling
    // In credit card statements:
    // - Positive amounts are typically purchases/expenses (money you spent)
    // - Negative amounts are typically credits/refunds (money back to you)
    // - Payments to credit card typically include "PAYMENT" in description
    const descriptionLower = (mapping.description || '').toLowerCase();
    const isPaymentToCard = descriptionLower.includes('payment') && 
                          (descriptionLower.includes('received') || 
                           descriptionLower.includes('thank you'));
    
    const isRefund = descriptionLower.includes('refund') || 
                    descriptionLower.includes('credit') || 
                    descriptionLower.includes('return');
    
    // Determine type if not already set
    let type = mapping.type;
    
    if (type === undefined) {
      // For credit card accounts, the logic is different from bank accounts
      if (accountType === 'credit_card') {
        if (isPaymentToCard) {
          // Payments to credit card (negative amounts) are income (reduce expenses)
          type = 'income';
        } else if (isRefund) {
          // Refunds and credits are income (reduce expenses)
          type = 'income';
        } else if (amount < 0) {
          // Other negative amounts on credit cards are typically credits/refunds
          type = 'income';
        } else {
          // Positive amounts on credit cards are typically purchases
          type = 'expense';
        }
      } else {
        // For non-credit-card accounts, use standard logic
        if (amount < 0) {
          type = 'expense';
        } else {
          type = 'income';
        }
      }
    }
    
    // Default handling if still not defined
    if (type === undefined) {
      type = amount < 0 ? 'expense' : 'income';
    }
    
    // Always use positive amounts with type indicating direction
    amount = Math.abs(amount);
    
    return new Transaction({
      date: mapping.date,
      description: mapping.description,
      amount: amount,
      type: type,
      account: mapping.account,
      accountType: accountType,
      merchant: merchant,
      balance: balance,
      reference: mapping.reference,
      currency: mapping.currency,
      source: 'csv'
    });
  }

  // Create a normalized Transaction object from XML data
  static fromXML(xmlItem) {
    // This method would need to be customized based on the XML format
    // Here's a generic implementation assuming basic structure
    const mapping = {
      date: xmlItem.Date?.[0] || xmlItem.TransactionDate?.[0] || xmlItem.date?.[0] || xmlItem.Dt?.[0] || '',
      description: xmlItem.Description?.[0] || xmlItem.Memo?.[0] || xmlItem.description?.[0] || xmlItem.desc?.[0] || '',
      amount: xmlItem.Amount?.[0] || xmlItem.Value?.[0] || xmlItem.amount?.[0] || xmlItem.value?.[0] || 0,
      type: (parseFloat(xmlItem.Amount?.[0] || xmlItem.amount?.[0] || 0) >= 0) ? 'income' : 'expense',
      account: xmlItem.Account?.[0] || xmlItem.account?.[0] || xmlItem.AccountName?.[0] || '',
      accountType: xmlItem.AccountType?.[0] || xmlItem.accountType?.[0] || xmlItem.AcctType?.[0] || '',
      merchant: xmlItem.Merchant?.[0] || xmlItem.Payee?.[0] || xmlItem.merchant?.[0] || xmlItem.payee?.[0] || '',
      balance: xmlItem.Balance?.[0] || xmlItem.balance?.[0] || xmlItem.RunningBalance?.[0] || null,
      reference: xmlItem.Reference?.[0] || xmlItem.TransactionId?.[0] || xmlItem.reference?.[0] || xmlItem.id?.[0] || null,
      currency: xmlItem.Currency?.[0] || xmlItem.currency?.[0] || xmlItem.CurrencyCode?.[0] || 'USD'
    };

    // Process the amount to ensure it's a proper number
    let amount = parseFloat(mapping.amount.toString().replace(/[^\d.-]/g, ''));
    
    // Convert negative values to positive for expenses
    if (mapping.type === 'expense' && amount < 0) {
      amount = Math.abs(amount);
    }

    // Process balance if available
    let balance = null;
    if (mapping.balance) {
      try {
        balance = parseFloat(mapping.balance.toString().replace(/[^\d.-]/g, ''));
      } catch (err) {
        console.warn('Could not parse balance field:', err);
      }
    }

    // If merchant isn't specified, try to extract it from description
    let merchant = mapping.merchant;
    if (!merchant && mapping.description) {
      // Extract first few words as merchant (simple approach)
      merchant = mapping.description.split(' ').slice(0, 2).join(' ');
    }

    // Determine account type if not specified
    let accountType = mapping.accountType;
    if (!accountType) {
      // Try to determine account type from account name or other fields
      const accountLower = (mapping.account || '').toLowerCase();
      if (accountLower.includes('credit') || accountLower.includes('card')) {
        accountType = 'credit_card';
      } else if (accountLower.includes('check') || accountLower.includes('saving') || accountLower.includes('bank')) {
        accountType = 'bank';
      } else if (accountLower.includes('paypal') || accountLower.includes('venmo') || accountLower.includes('wallet')) {
        accountType = 'wallet';
      } else {
        accountType = 'other';
      }
    }

    return new Transaction({
      date: mapping.date,
      description: mapping.description,
      amount: amount,
      type: mapping.type,
      account: mapping.account,
      accountType: accountType, 
      merchant: merchant,
      balance: balance,
      reference: mapping.reference,
      currency: mapping.currency,
      source: 'xml'
    });
  }
}

module.exports = Transaction;
