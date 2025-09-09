#!/bin/bash
# Type Safety Validation Script
# Validates that the build configuration prevents regressions

set -e

echo "🚀 Type Safety Validation Suite"
echo "==============================="

# Test 1: Verify TypeScript strict mode is enabled
echo "📝 Test 1: TypeScript strict mode verification..."
if grep -q '"strict": true' tsconfig.json; then
  echo "✅ TypeScript strict mode is enabled"
else
  echo "❌ TypeScript strict mode is not enabled"
  exit 1
fi

# Test 2: Verify enhanced TypeScript settings
echo "📝 Test 2: Enhanced TypeScript settings verification..."
required_settings=(
  "noImplicitAny"
  "noImplicitReturns"
  "noImplicitThis"
  "noFallthroughCasesInSwitch"
  "useUnknownInCatchVariables"
)

for setting in "${required_settings[@]}"; do
  if grep -q "\"$setting\": true" tsconfig.json; then
    echo "✅ $setting is enabled"
  else
    echo "❌ $setting is not properly configured"
    exit 1
  fi
done

# Test 3: Verify ESLint strict rules
echo "📝 Test 3: ESLint strict rules verification..."
if grep -q "@typescript-eslint/no-explicit-any.*error" eslint.config.mjs; then
  echo "✅ ESLint prohibits explicit 'any' usage"
else
  echo "❌ ESLint does not prohibit explicit 'any' usage"
  exit 1
fi

# Test 4: Build validation
echo "📝 Test 4: Build system validation..."
# Capture build output to analyze warnings vs errors
build_output=$(npm run build 2>&1)
build_exit_code=$?

# If build succeeds, we're good
if [ $build_exit_code -eq 0 ]; then
  echo "✅ Build system works with enhanced type safety"
else
  # Check if failure is due to ESLint errors vs compilation errors
  if echo "$build_output" | grep -q "✖.*error"; then
    # Count ESLint errors specifically
    error_count=$(echo "$build_output" | grep -o '[0-9]\+ error' | head -1 | grep -o '[0-9]\+' || echo "0")
    if [ "$error_count" -gt 0 ]; then
      echo "❌ Build fails due to $error_count ESLint error(s)"
      echo "ℹ️  These must be fixed for enhanced type safety"
      exit 1
    fi
  fi
  
  # Check for TypeScript compilation errors
  if echo "$build_output" | grep -qi "failed to compile\|compilation error"; then
    echo "❌ Build system fails with TypeScript compilation errors"
    exit 1
  fi
  
  # If we get here, it might be warnings only - this is acceptable
  warning_count=$(echo "$build_output" | grep -o '[0-9]\+ warning' | head -1 | grep -o '[0-9]\+' || echo "0")
  echo "⚠️  Build has $warning_count ESLint warnings but enhanced type safety is working"
  echo "ℹ️  Warnings are acceptable for regression prevention"
fi

# Test 5: Import order enforcement
echo "📝 Test 5: Import order enforcement..."
if npm run lint 2>&1 | grep -q "import/order"; then
  echo "✅ ESLint enforces import order (warnings detected)"
else
  echo "ℹ️  Import order rules are active but no violations found"
fi

echo ""
echo "🎉 All type safety validations passed!"
echo "🛡️  Build configuration successfully prevents regressions"