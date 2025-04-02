
/**
 * Code Review Script
 * 
 * This script analyzes the codebase for potential issues and provides recommendations.
 */

const codeReviewService = require('./src/server/services/codeReview');
const fs = require('fs');

// Run the code analysis
const report = codeReviewService.analyzeCode();

// Format the report
const formatReport = (report) => {
  let output = '# Code Review Report\n\n';
  
  if (report.errors.length > 0) {
    output += '## Errors\n\n';
    report.errors.forEach(error => {
      output += `- **${error.type}**: ${error.message}`;
      if (error.file) {
        output += ` (in \`${error.file}\`)`;
      }
      output += '\n';
    });
    output += '\n';
  }
  
  if (report.warnings.length > 0) {
    output += '## Warnings\n\n';
    report.warnings.forEach(warning => {
      output += `- **${warning.type}**: ${warning.message}`;
      if (warning.file) {
        output += ` (in \`${warning.file}\`)`;
      }
      output += '\n';
    });
    output += '\n';
  }
  
  if (report.suggestions.length > 0) {
    output += '## Suggestions\n\n';
    report.suggestions.forEach(suggestion => {
      output += `- **${suggestion.type}**: ${suggestion.message}`;
      if (suggestion.file) {
        output += ` (in \`${suggestion.file}\`)`;
      }
      output += '\n';
    });
    output += '\n';
  }
  
  return output;
};

// Save the report to a file
const reportOutput = formatReport(report);
fs.writeFileSync('code-review-report.md', reportOutput);

console.log('Code review completed. See code-review-report.md for the results.');
console.log(`Found ${report.errors.length} errors, ${report.warnings.length} warnings, and ${report.suggestions.length} suggestions.`);

// Also print a summary to the console
console.log('\nSummary of issues:');
if (report.errors.length > 0) {
  console.log('\nErrors:');
  report.errors.forEach(error => {
    console.log(`- ${error.message} (${error.type})`);
  });
}

if (report.warnings.length > 0) {
  console.log('\nWarnings:');
  report.warnings.forEach(warning => {
    console.log(`- ${warning.message} (${warning.type})`);
  });
}
