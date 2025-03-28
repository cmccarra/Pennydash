/**
 * Transaction model representing a financial transaction
 */
const crypto = require('crypto');

class Transaction {
  constructor(data) {
    this.id = data.id || crypto.randomUUID();
    this.date = data.date || new Date().toISOString().split('T')[0];
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
    // Default mapping assuming standard columns
    const mapping = {
      date: csvRow.Date || csvRow.date || csvRow.DATE || csvRow.TransactionDate || csvRow.TRANSACTION_DATE || '',
      description: csvRow.Description || csvRow.description || csvRow.DESC || csvRow.Memo || csvRow.MEMO || csvRow.DESCRIPTION || '',
      amount: csvRow.Amount || csvRow.amount || csvRow.AMOUNT || csvRow.Value || csvRow.VALUE || csvRow.TRANSACTION_AMOUNT || 0,
      type: (parseFloat(csvRow.Amount || csvRow.amount || csvRow.TRANSACTION_AMOUNT || 0) >= 0) ? 'income' : 'expense',
      account: csvRow.Account || csvRow.account || csvRow.ACCOUNT || csvRow.AccountName || csvRow.ACCOUNT_NAME || '',
      accountType: csvRow.AccountType || csvRow.accountType || csvRow.ACCOUNT_TYPE || '',
      merchant: csvRow.Merchant || csvRow.merchant || csvRow.MERCHANT || csvRow.Payee || csvRow.PAYEE || '',
      balance: csvRow.Balance || csvRow.balance || csvRow.BALANCE || csvRow.RUNNING_BALANCE || null,
      reference: csvRow.Reference || csvRow.reference || csvRow.REF || csvRow.REFERENCE || csvRow.TransactionId || csvRow.TRANSACTION_ID || null,
      currency: csvRow.Currency || csvRow.currency || csvRow.CURRENCY || 'USD'
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
