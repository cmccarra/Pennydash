
/**
 * Code Review Service
 * 
 * This service helps analyze the codebase for potential issues
 * and provides recommendations for improvements.
 */

const fs = require('fs');
const path = require('path');

/**
 * Checks for common issues in the codebase
 * @returns {Object} A report of issues found
 */
const analyzeCode = () => {
  const report = {
    errors: [],
    warnings: [],
    suggestions: []
  };

  try {
    // Check for OpenAI integration issues
    checkOpenAIIntegration(report);
    
    // Check for database configuration issues
    checkDatabaseConfig(report);
    
    // Check for error handling
    checkErrorHandling(report);
    
    // Check for performance issues
    checkPerformance(report);
    
  } catch (error) {
    report.errors.push({
      type: 'runtime',
      message: `Error running code analysis: ${error.message}`,
      stack: error.stack
    });
  }

  return report;
};

/**
 * Check OpenAI integration
 */
const checkOpenAIIntegration = (report) => {
  try {
    // Check if OpenAI service exists
    const openaiServicePath = path.join(__dirname, 'openai.js');
    if (!fs.existsSync(openaiServicePath)) {
      report.errors.push({
        type: 'missing-file',
        message: 'OpenAI service file is missing',
        file: 'src/server/services/openai.js'
      });
      return;
    }

    // Check if OpenAI is properly imported in categorySuggestion.js
    const categorySuggestionPath = path.join(__dirname, 'categorySuggestion.js');
    if (!fs.existsSync(categorySuggestionPath)) {
      report.errors.push({
        type: 'missing-file',
        message: 'Category suggestion service file is missing',
        file: 'src/server/services/categorySuggestion.js'
      });
      return;
    }

    const categorySuggestionContent = fs.readFileSync(categorySuggestionPath, 'utf8');
    if (!categorySuggestionContent.includes('openaiService')) {
      report.warnings.push({
        type: 'integration',
        message: 'OpenAI service might not be properly integrated in categorySuggestion.js',
        file: 'src/server/services/categorySuggestion.js'
      });
    }

    // Check for fallback mechanism in case OpenAI fails
    if (!categorySuggestionContent.includes('fallback') && !categorySuggestionContent.includes('catch')) {
      report.suggestions.push({
        type: 'resilience',
        message: 'Consider adding a fallback mechanism in case OpenAI service fails',
        file: 'src/server/services/categorySuggestion.js'
      });
    }
  } catch (error) {
    report.errors.push({
      type: 'analysis',
      message: `Error analyzing OpenAI integration: ${error.message}`,
      stack: error.stack
    });
  }
};

/**
 * Check database configuration
 */
const checkDatabaseConfig = (report) => {
  try {
    const sequelizePath = path.join(__dirname, '../db/sequelize.js');
    if (!fs.existsSync(sequelizePath)) {
      report.errors.push({
        type: 'missing-file',
        message: 'Sequelize configuration file is missing',
        file: 'src/server/db/sequelize.js'
      });
      return;
    }

    const sequelizeContent = fs.readFileSync(sequelizePath, 'utf8');
    
    // Check for proper environment variables
    if (!sequelizeContent.includes('process.env.DATABASE_URL')) {
      report.warnings.push({
        type: 'config',
        message: 'Database URL should be configurable via environment variables',
        file: 'src/server/db/sequelize.js'
      });
    }

    // Check for connection pooling
    if (!sequelizeContent.includes('pool')) {
      report.suggestions.push({
        type: 'performance',
        message: 'Consider adding connection pooling for better database performance',
        file: 'src/server/db/sequelize.js'
      });
    }
  } catch (error) {
    report.errors.push({
      type: 'analysis',
      message: `Error analyzing database configuration: ${error.message}`,
      stack: error.stack
    });
  }
};

/**
 * Check error handling
 */
const checkErrorHandling = (report) => {
  try {
    // Check for global error handler in index.js
    const indexPath = path.join(__dirname, '../index.js');
    if (!fs.existsSync(indexPath)) {
      report.errors.push({
        type: 'missing-file',
        message: 'Server index file is missing',
        file: 'src/server/index.js'
      });
      return;
    }

    const indexContent = fs.readFileSync(indexPath, 'utf8');
    if (!indexContent.includes('app.use((err, req, res, next)')) {
      report.warnings.push({
        type: 'error-handling',
        message: 'Global error handler middleware is recommended',
        file: 'src/server/index.js'
      });
    }

    // Check error handling in routes
    const routesDir = path.join(__dirname, '../routes');
    if (fs.existsSync(routesDir)) {
      const routeFiles = fs.readdirSync(routesDir);
      for (const file of routeFiles) {
        if (file.endsWith('.js')) {
          const routeContent = fs.readFileSync(path.join(routesDir, file), 'utf8');
          
          // Count try-catch blocks
          const tryCatchCount = (routeContent.match(/try\s*{/g) || []).length;
          
          if (tryCatchCount === 0) {
            report.warnings.push({
              type: 'error-handling',
              message: 'No try-catch blocks found in route file',
              file: `src/server/routes/${file}`
            });
          }
        }
      }
    }
  } catch (error) {
    report.errors.push({
      type: 'analysis',
      message: `Error analyzing error handling: ${error.message}`,
      stack: error.stack
    });
  }
};

/**
 * Check for performance issues
 */
const checkPerformance = (report) => {
  try {
    // Check for pagination in transaction routes
    const transactionRoutesPath = path.join(__dirname, '../routes/transactions.sequelize.js');
    if (fs.existsSync(transactionRoutesPath)) {
      const transactionRoutesContent = fs.readFileSync(transactionRoutesPath, 'utf8');
      
      if (!transactionRoutesContent.includes('limit') || !transactionRoutesContent.includes('offset')) {
        report.suggestions.push({
          type: 'performance',
          message: 'Consider implementing pagination for transaction endpoints',
          file: 'src/server/routes/transactions.sequelize.js'
        });
      }
      
      // Check for proper indexes in models
      const transactionModelPath = path.join(__dirname, '../models/sequelize/Transaction.js');
      if (fs.existsSync(transactionModelPath)) {
        const transactionModelContent = fs.readFileSync(transactionModelPath, 'utf8');
        
        if (!transactionModelContent.includes('indexes:')) {
          report.suggestions.push({
            type: 'performance',
            message: 'Consider adding database indexes for frequently queried columns',
            file: 'src/server/models/sequelize/Transaction.js'
          });
        }
      }
    }
  } catch (error) {
    report.errors.push({
      type: 'analysis',
      message: `Error analyzing performance: ${error.message}`,
      stack: error.stack
    });
  }
};

module.exports = {
  analyzeCode,
};
