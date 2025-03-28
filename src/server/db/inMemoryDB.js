/**
 * In-memory database implementation for the budgeting app
 * This will store transactions, categories, and other data in memory
 */

class InMemoryDB {
  constructor() {
    // Initialize our collections
    this.transactions = [];
    this.categories = [
      { id: '1', name: 'Food', color: '#4CAF50' },
      { id: '2', name: 'Transportation', color: '#2196F3' },
      { id: '3', name: 'Housing', color: '#FF9800' },
      { id: '4', name: 'Entertainment', color: '#9C27B0' },
      { id: '5', name: 'Shopping', color: '#F44336' },
      { id: '6', name: 'Utilities', color: '#607D8B' },
      { id: '7', name: 'Healthcare', color: '#00BCD4' },
      { id: '8', name: 'Income', color: '#8BC34A', type: 'income' }
    ];
    this.settings = {
      confidenceThreshold: 0.7,
      defaultCategory: '1'
    };
    
    this._transactionIdCounter = 1;
    this._categoryIdCounter = this.categories.length + 1;
  }

  // Transaction methods
  getAllTransactions() {
    return Promise.resolve([...this.transactions]);
  }

  getTransactionById(id) {
    const transaction = this.transactions.find(t => t.id === id);
    return Promise.resolve(transaction || null);
  }

  addTransaction(transaction) {
    const newTransaction = {
      ...transaction,
      id: transaction.id || String(this._transactionIdCounter++),
      createdAt: transaction.createdAt || new Date().toISOString()
    };
    this.transactions.push(newTransaction);
    return Promise.resolve(newTransaction);
  }

  updateTransaction(id, updateData) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) {
      return Promise.resolve(null);
    }
    
    this.transactions[index] = {
      ...this.transactions[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    return Promise.resolve(this.transactions[index]);
  }

  deleteTransaction(id) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) {
      return Promise.resolve(false);
    }
    
    this.transactions.splice(index, 1);
    return Promise.resolve(true);
  }

  // Batch operations
  addTransactions(transactions) {
    const newTransactions = transactions.map(transaction => ({
      ...transaction,
      id: transaction.id || String(this._transactionIdCounter++),
      createdAt: transaction.createdAt || new Date().toISOString()
    }));
    
    this.transactions.push(...newTransactions);
    return Promise.resolve(newTransactions);
  }

  updateTransactionsCategory(transactionIds, categoryId) {
    const updatedTransactions = [];
    
    for (const id of transactionIds) {
      const index = this.transactions.findIndex(t => t.id === id);
      if (index !== -1) {
        this.transactions[index] = {
          ...this.transactions[index],
          categoryId,
          updatedAt: new Date().toISOString()
        };
        updatedTransactions.push(this.transactions[index]);
      }
    }
    
    return Promise.resolve(updatedTransactions);
  }

  // Category methods
  getAllCategories() {
    return Promise.resolve([...this.categories]);
  }

  getCategoryById(id) {
    const category = this.categories.find(c => c.id === id);
    return Promise.resolve(category || null);
  }

  addCategory(category) {
    const newCategory = {
      ...category,
      id: category.id || String(this._categoryIdCounter++),
      createdAt: category.createdAt || new Date().toISOString()
    };
    this.categories.push(newCategory);
    return Promise.resolve(newCategory);
  }

  updateCategory(id, updateData) {
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) {
      return Promise.resolve(null);
    }
    
    this.categories[index] = {
      ...this.categories[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    return Promise.resolve(this.categories[index]);
  }

  deleteCategory(id) {
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) {
      return Promise.resolve(false);
    }
    
    // Don't allow deleting if there are transactions with this category
    const hasTransactions = this.transactions.some(t => t.categoryId === id);
    if (hasTransactions) {
      return Promise.reject(new Error('Cannot delete category with associated transactions'));
    }
    
    this.categories.splice(index, 1);
    return Promise.resolve(true);
  }

  // Settings methods
  getSettings() {
    return Promise.resolve({...this.settings});
  }

  updateSettings(updateData) {
    this.settings = {
      ...this.settings,
      ...updateData
    };
    return Promise.resolve(this.settings);
  }

  // Reporting methods
  getTransactionsByCategory() {
    const result = [];
    
    for (const category of this.categories) {
      const transactions = this.transactions.filter(t => t.categoryId === category.id);
      const total = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      
      result.push({
        category,
        transactions,
        total,
        count: transactions.length
      });
    }
    
    return Promise.resolve(result);
  }

  getMonthlyTotals() {
    const monthlyData = {};
    
    for (const transaction of this.transactions) {
      const date = new Date(transaction.date);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = {
          expenses: 0,
          income: 0
        };
      }
      
      const category = this.categories.find(c => c.id === transaction.categoryId);
      if (category && category.type === 'income') {
        monthlyData[monthYear].income += (transaction.amount || 0);
      } else {
        monthlyData[monthYear].expenses += (transaction.amount || 0);
      }
    }
    
    return Promise.resolve(Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...data
      }))
      .sort((a, b) => a.month.localeCompare(b.month)));
  }

  getUncategorizedTransactions() {
    return Promise.resolve(
      this.transactions.filter(t => !t.categoryId || t.categoryId === '')
    );
  }
}

// Export a singleton instance
const db = new InMemoryDB();
module.exports = db;
