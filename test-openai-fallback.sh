#!/bin/bash

# Script to test OpenAI fallback with simulated API failures

# Show usage
echo "==================================================="
echo "OpenAI Fallback Mechanism Test"
echo "==================================================="
echo ""
echo "This script tests the fallback from OpenAI to the Bayes classifier."
echo "Usage: bash test-openai-fallback.sh [--simulate-failure]"
echo ""

# Set environment variable based on argument
if [[ "$1" == "--simulate-failure" ]]; then
  export SIMULATE_OPENAI_FAILURE=true
  echo "Simulating OpenAI API failures"
else
  export SIMULATE_OPENAI_FAILURE=false
  echo "Testing with normal OpenAI behavior (fallback only when rate limited)"
fi

echo ""
echo "Running test..."
echo ""

# Run the test
node category-fallback-test.js > fallback-test-output.txt

# Show a brief summary of results
echo ""
echo "==================================================="
echo "Test Results Summary"
echo "==================================================="
echo ""

# Extract key metrics
TOTAL_CALLS=$(grep -o "apiCalls: [0-9]*" fallback-test-output.txt | tail -1 | cut -d' ' -f2)
ERRORS=$(grep -o "errors: [0-9]*" fallback-test-output.txt | tail -1 | cut -d' ' -f2)
OPENAI_COUNT=$(grep -o "OpenAI categorizations: [0-9]*" fallback-test-output.txt | head -1 | cut -d' ' -f3)
BAYES_COUNT=$(grep -o "Bayes classifier fallbacks: [0-9]*" fallback-test-output.txt | head -1 | cut -d' ' -f4)

echo "API calls attempted: $TOTAL_CALLS"
echo "Errors encountered: $ERRORS"
echo "OpenAI categorizations: $OPENAI_COUNT"
echo "Bayes classifier fallbacks: $BAYES_COUNT"
echo ""

# Check for success or warning messages
SUCCESS=$(grep -c "SUCCESS:" fallback-test-output.txt)
WARNING=$(grep -c "WARNING:" fallback-test-output.txt)

if [ $SUCCESS -gt 0 ]; then
  echo "✅ PASSED: Fallback mechanism is working properly"
elif [ $WARNING -gt 0 ]; then
  echo "⚠️ FAILED: Fallback mechanism is not working correctly"
else
  echo "❓ INCONCLUSIVE: Could not determine test result"
fi

echo ""
echo "For full details, see fallback-test-output.txt"
echo ""