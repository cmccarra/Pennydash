/**
 * Wallet model representing a collaborative budget wallet
 */

class Wallet {
  constructor(data) {
    this.id = data.id || null;
    this.name = data.name;
    this.description = data.description || '';
    this.budget = data.budget || 0;
    this.ownerUserId = data.ownerUserId;
    this.members = data.members || [];
    this.categories = data.categories || [];
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || null;
    this.currency = data.currency || 'USD';
    this.icon = data.icon || 'wallet';
    this.color = data.color || '#7C3AED'; // Use the primary color as default
    this.shared = true; // By definition all wallets created through this model are shared
  }

  /**
   * Validate wallet data before creating or updating
   * @param {Object} data - Wallet data to validate
   * @returns {Object} Object with isValid flag and potential errors
   */
  static validate(data) {
    const errors = [];

    // Required fields
    if (!data.name) {
      errors.push('Wallet name is required');
    } else if (data.name.length < 2) {
      errors.push('Wallet name must be at least 2 characters long');
    }

    // Validate budget is a number
    if (data.budget !== undefined && (isNaN(data.budget) || data.budget < 0)) {
      errors.push('Budget must be a non-negative number');
    }

    // Validate members is an array
    if (data.members !== undefined && !Array.isArray(data.members)) {
      errors.push('Members must be an array');
    }

    // Validate categories is an array
    if (data.categories !== undefined && !Array.isArray(data.categories)) {
      errors.push('Categories must be an array');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a random color for wallet
   * @returns {string} Random color hex code
   */
  static generateRandomColor() {
    const colors = [
      '#7C3AED', // Purple (primary)
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Amber
      '#EF4444', // Red
      '#8B5CF6', // Indigo
      '#EC4899', // Pink
      '#06B6D4', // Cyan
      '#F97316'  // Orange
    ];
    
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

module.exports = Wallet;