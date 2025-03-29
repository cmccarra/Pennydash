# OpenAI Fallback Mechanism

This document provides an overview of the OpenAI fallback mechanism implemented in the transaction categorization system.

## Overview

The system uses a two-tier approach for transaction categorization:

1. **Primary: OpenAI API** - Provides high-quality categorization suggestions with detailed reasoning
2. **Fallback: Bayes Classifier** - Used when OpenAI is unavailable, rate-limited, or encounters errors

## Key Features

- **Automatic Failover** - Seamlessly switches to Bayes classifier when OpenAI issues occur
- **Error Handling** - Implements exponential backoff and retry logic for transient errors
- **Rate Limit Management** - Detects and respects OpenAI API rate limits
- **Source Tracking** - Each categorization includes its source (openai, openai-cache, bayes-classifier)
- **Confidence Scoring** - Both tiers provide confidence scores for suggested categories
- **Batch Processing** - Works for both individual and batch transaction categorization

## Implementation Details

The fallback mechanism is implemented in:

- `src/server/services/openai.js` - OpenAI service with error handling and retry logic
- `src/server/services/categorySuggestion.js` - Main service handling fallback logic

## Testing

The fallback mechanism can be tested using:

```bash
# Run test with normal behavior
./test-openai-fallback.sh

# Simulate OpenAI failures to force fallback
./test-openai-fallback.sh --simulate-failure
```

The test validates:
- Individual transaction categorization
- Batch transaction categorization
- Proper fallback behavior with simulated failures
- Confidence scoring and source tracking

## Error Handling

The system handles these error scenarios:

1. **API Timeout** - Falls back to Bayes classifier after retry attempts
2. **Rate Limiting** - Detects 429 errors and falls back to Bayes classifier
3. **Invalid Responses** - Gracefully handles malformed API responses
4. **OpenAI Unreachable** - Falls back to Bayes classifier when API is unreachable

## Metrics

The system tracks metrics for OpenAI usage:

- API call count
- Cache hit rate
- Error count
- Rate limit occurrences
- Response times

## Confidence Scoring

Both categorization methods provide confidence scores:

- OpenAI: Scale of 0-1 based on reasoning and pattern matching
- Bayes Classifier: Scale of 0-1 based on statistical probability

## Limitations

- Bayes classifier has lower accuracy than OpenAI but provides reasonable fallback
- Confidence scores from the two methods are not directly comparable
- Initial training of Bayes classifier requires existing categorized transactions

## Future Improvements

- Add more sophisticated NLP techniques to the Bayes classifier
- Implement a more robust caching mechanism
- Add automated re-training of the Bayes classifier with verified transactions