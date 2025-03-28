/**
 * Transaction model representing a financial transaction
 */

class Transaction {
  constructor(data) {
    this.id = data.id || null;
    this.date = data.date || new Date().toISOString().split('T')[0];
    this.description = data.description || '';
    this.amount = parseFloat(data.amount) || 0;
    this.type = data.type || 'expense'; // 'expense' or 'income'
    this.categoryId = data.categoryId || null;
    this.account = data.account || '';
    this.notes = data.notes || '';
    this.source = data.source || 'manual'; // 'manual', 'csv', 'xml', etc.
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
      date: csvRow.Date || csvRow.date || csvRow.DATE || csvRow.TransactionDate || '',
      description: csvRow.Description || csvRow.description || csvRow.DESC || csvRow.Memo || csvRow.MEMO || '',
      amount: csvRow.Amount || csvRow.amount || csvRow.AMOUNT || csvRow.Value || csvRow.VALUE || 0,
      type: (parseFloat(csvRow.Amount || csvRow.amount || 0) >= 0) ? 'income' : 'expense',
      account: csvRow.Account || csvRow.account || csvRow.ACCOUNT || ''
    };

    // Process the amount to ensure it's a proper number
    let amount = parseFloat(mapping.amount.toString().replace(/[^\d.-]/g, ''));
    
    // Convert negative values to positive for expenses
    if (mapping.type === 'expense' && amount < 0) {
      amount = Math.abs(amount);
    }

    return new Transaction({
      date: mapping.date,
      description: mapping.description,
      amount: amount,
      type: mapping.type,
      account: mapping.account,
      source: 'csv'
    });
  }

  // Create a normalized Transaction object from XML data
  static fromXML(xmlItem) {
    // This method would need to be customized based on the XML format
    // Here's a generic implementation assuming basic structure
    const mapping = {
      date: xmlItem.Date?.[0] || xmlItem.TransactionDate?.[0] || '',
      description: xmlItem.Description?.[0] || xmlItem.Memo?.[0] || '',
      amount: xmlItem.Amount?.[0] || xmlItem.Value?.[0] || 0,
      type: (parseFloat(xmlItem.Amount?.[0] || 0) >= 0) ? 'income' : 'expense',
      account: xmlItem.Account?.[0] || ''
    };

    // Process the amount to ensure it's a proper number
    let amount = parseFloat(mapping.amount.toString().replace(/[^\d.-]/g, ''));
    
    // Convert negative values to positive for expenses
    if (mapping.type === 'expense' && amount < 0) {
      amount = Math.abs(amount);
    }

    return new Transaction({
      date: mapping.date,
      description: mapping.description,
      amount: amount,
      type: mapping.type,
      account: mapping.account,
      source: 'xml'
    });
  }
}

module.exports = Transaction;
