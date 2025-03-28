/**
 * Service for managing categories and category suggestions
 */
import { categoriesApi } from './api';

/**
 * Get a category's color by ID
 * @param {Array} categories - List of categories
 * @param {string} categoryId - Category ID
 * @returns {string} Color hex code or default color
 */
export const getCategoryColor = (categories, categoryId) => {
  if (!categories || !categoryId) return '#cccccc';
  
  const category = categories.find(c => c.id === categoryId);
  return category ? category.color : '#cccccc';
};

/**
 * Get a category's name by ID
 * @param {Array} categories - List of categories
 * @param {string} categoryId - Category ID
 * @returns {string} Category name or 'Uncategorized'
 */
export const getCategoryName = (categories, categoryId) => {
  if (!categories || !categoryId) return 'Uncategorized';
  
  const category = categories.find(c => c.id === categoryId);
  return category ? category.name : 'Uncategorized';
};

/**
 * Get all income categories
 * @param {Array} categories - List of categories
 * @returns {Array} Income categories
 */
export const getIncomeCategories = (categories) => {
  if (!categories) return [];
  return categories.filter(c => c.type === 'income');
};

/**
 * Get all expense categories
 * @param {Array} categories - List of categories
 * @returns {Array} Expense categories
 */
export const getExpenseCategories = (categories) => {
  if (!categories) return [];
  return categories.filter(c => c.type !== 'income');
};

/**
 * Format amount as currency
 * @param {number} amount - Amount to format
 * @param {string} locale - Locale for formatting
 * @returns {string} Formatted amount
 */
export const formatCurrency = (amount, locale = 'en-US') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
};

/**
 * Calculate total amount for a category
 * @param {Array} transactions - List of transactions
 * @param {string} categoryId - Category ID
 * @returns {number} Total amount
 */
export const calculateCategoryTotal = (transactions, categoryId) => {
  if (!transactions || !categoryId) return 0;
  
  return transactions
    .filter(t => t.categoryId === categoryId)
    .reduce((sum, t) => sum + (t.amount || 0), 0);
};

/**
 * Create a new category and refresh the categories list
 * @param {Object} categoryData - New category data
 * @returns {Promise} Promise with the new category
 */
export const createCategory = async (categoryData) => {
  try {
    return await categoriesApi.create(categoryData);
  } catch (error) {
    console.error('Error creating category:', error);
    throw error;
  }
};

/**
 * Generate color palette for charts
 * @param {number} count - Number of colors needed
 * @returns {Array} Array of color hex codes
 */
export const generateChartColors = (count) => {
  // Use a predefined color palette
  const basePalette = [
    '#4CAF50', // Green
    '#2196F3', // Blue
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#F44336', // Red
    '#00BCD4', // Cyan
    '#FFC107', // Amber
    '#3F51B5', // Indigo
    '#795548', // Brown
    '#607D8B', // Blue Grey
    '#E91E63', // Pink
    '#8BC34A', // Light Green
    '#009688', // Teal
    '#FFEB3B', // Yellow
    '#673AB7'  // Deep Purple
  ];
  
  // If we need more colors than in the palette, we'll generate them
  if (count <= basePalette.length) {
    return basePalette.slice(0, count);
  }
  
  // Generate additional random colors if needed
  const colors = [...basePalette];
  for (let i = basePalette.length; i < count; i++) {
    const hue = (i * 137) % 360; // Use golden ratio for even distribution
    colors.push(`hsl(${hue}, 70%, 60%)`);
  }
  
  return colors;
};
