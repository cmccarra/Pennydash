/**
 * Sequelize model for transaction uploads
 */
const { Model, DataTypes } = require('sequelize');

class Upload extends Model {
  /**
   * Initialize the model with Sequelize
   * @param {Sequelize} sequelize - Sequelize instance
   * @returns {Model} Initialized model
   */
  static init(sequelize) {
    return super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        filename: {
          type: DataTypes.STRING,
          allowNull: false
        },
        originalFilename: {
          type: DataTypes.STRING,
          allowNull: false
        },
        fileType: {
          type: DataTypes.STRING,
          allowNull: false
        },
        fileSize: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        status: {
          type: DataTypes.ENUM('pending', 'processing', 'processed', 'completed', 'failed'),
          defaultValue: 'pending'
        },
        accountName: {
          type: DataTypes.STRING,
          allowNull: true
        },
        accountType: {
          type: DataTypes.STRING,
          allowNull: true
        },
        transactionCount: {
          type: DataTypes.INTEGER,
          defaultValue: 0
        },
        metadata: {
          type: DataTypes.JSONB,
          defaultValue: {}
        },
        importSource: {
          type: DataTypes.STRING,
          allowNull: true
        },
        processingError: {
          type: DataTypes.TEXT,
          allowNull: true
        }
      },
      {
        sequelize,
        modelName: 'upload',
        tableName: 'uploads',
        underscored: true,
        timestamps: true
      }
    );
  }

  /**
   * Set up model associations
   * @param {Object} models - All models
   */
  static associate(models) {
    // Upload has many Transactions
    if (models.Transaction) {
      this.hasMany(models.Transaction, {
        foreignKey: 'uploadId',
        as: 'transactions'
      });
    }

    // Upload has many Batches
    if (models.Batch) {
      this.hasMany(models.Batch, {
        foreignKey: 'uploadId',
        as: 'batches'
      });
    }
  }
}

module.exports = Upload;