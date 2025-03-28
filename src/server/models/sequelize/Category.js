/**
 * Category model representing a transaction category using Sequelize
 */
const { Model, DataTypes } = require('sequelize');

class Category extends Model {
  /**
   * Initialize the Category model with Sequelize
   * @param {Sequelize} sequelize - Sequelize instance
   */
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      type: {
        type: DataTypes.ENUM('income', 'expense'),
        allowNull: false,
        defaultValue: 'expense'
      },
      color: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '#6c757d', // Default gray color
        validate: {
          isHexColor(value) {
            if (!/^#[0-9A-F]{6}$/i.test(value)) {
              throw new Error('Color must be a valid hex color code (e.g., #FF5733)');
            }
          }
        }
      },
      icon: {
        type: DataTypes.STRING,
        allowNull: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      parentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        }
      }
    }, {
      sequelize,
      modelName: 'category',
      tableName: 'categories',
      underscored: true, // Use snake_case for column names
      timestamps: true, // Add createdAt and updatedAt
      indexes: [
        {
          fields: ['name']
        },
        {
          fields: ['type']
        },
        {
          fields: ['parent_id']
        }
      ]
    });

    return this;
  }

  /**
   * Define associations with other models
   * @param {Object} models - The models object containing all defined models
   */
  static associate(models) {
    // Category has many Transactions
    this.hasMany(models.Transaction, {
      foreignKey: 'categoryId',
      as: 'transactions'
    });

    // Category can have a parent Category (for hierarchical categories)
    this.belongsTo(this, {
      foreignKey: 'parentId',
      as: 'parent'
    });

    // Category can have many child Categories
    this.hasMany(this, {
      foreignKey: 'parentId',
      as: 'children'
    });
  }

  /**
   * Generate a random color for new categories
   * @returns {string} Random color hex code
   */
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