/**
 * Category model representing a transaction category
 */

class Category {
  constructor(data) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.color = data.color || '#cccccc';
    this.type = data.type || 'expense'; // 'expense' or 'income'
    this.description = data.description || '';
    this.icon = data.icon || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Validate category data
  static validate(data) {
    const errors = [];

    if (!data.name) {
      errors.push('Name is required');
    }

    if (data.color && !/^#[0-9A-F]{6}$/i.test(data.color)) {
      errors.push('Color must be a valid hex color code (e.g., #FF5733)');
    }

    if (data.type && !['expense', 'income'].includes(data.type)) {
      errors.push('Type must be either "expense" or "income"');
    }

    return errors;
  }

  // Generate a random color for new categories
  static generateRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }
}

module.exports = Category;
