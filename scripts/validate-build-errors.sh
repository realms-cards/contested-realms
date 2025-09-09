#!/bin/bash

# Build Validation Script for TypeScript Error Tracking
# Usage: ./scripts/validate-build-errors.sh [--json|--summary|--detailed]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FORMAT="summary"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --json)
      OUTPUT_FORMAT="json"
      shift
      ;;
    --summary)
      OUTPUT_FORMAT="summary"
      shift
      ;;
    --detailed)
      OUTPUT_FORMAT="detailed"
      shift
      ;;
    *)
      echo "Usage: $0 [--json|--summary|--detailed]"
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

# Run linting and capture output
TEMP_LOG=$(mktemp)
npm run lint > "$TEMP_LOG" 2>&1 || true

# Count different error types
TOTAL_PROBLEMS=$(grep -c "error\|warning" "$TEMP_LOG" || echo "0")
EXPLICIT_ANY=$(grep -c "Unexpected any" "$TEMP_LOG" || echo "0")
UNUSED_VARS=$(grep -c "is assigned a value but never used\|is defined but never used" "$TEMP_LOG" || echo "0")
HOOK_DEPS=$(grep -c "missing dependency\|React Hook" "$TEMP_LOG" || echo "0")
PREFER_CONST=$(grep -c "Use 'const' instead\|prefer-const" "$TEMP_LOG" || echo "0")
TS_IGNORE=$(grep -c "@ts-ignore\|@ts-expect-error" "$TEMP_LOG" || echo "0")
ERRORS=$(grep -c " error " "$TEMP_LOG" || echo "0")
WARNINGS=$(grep -c " warning " "$TEMP_LOG" || echo "0")

# Determine build status
if [ "$ERRORS" -gt 0 ]; then
  BUILD_STATUS="FAILING"
  EXIT_CODE=1
else
  BUILD_STATUS="PASSING" 
  EXIT_CODE=0
fi

# Output based on format
case $OUTPUT_FORMAT in
  json)
    cat << EOF
{
  "timestamp": "$TIMESTAMP",
  "build_status": "$BUILD_STATUS",
  "summary": {
    "total_problems": $TOTAL_PROBLEMS,
    "errors": $ERRORS,
    "warnings": $WARNINGS
  },
  "categories": {
    "explicit_any": $EXPLICIT_ANY,
    "unused_variables": $UNUSED_VARS,
    "hook_dependencies": $HOOK_DEPS,
    "prefer_const": $PREFER_CONST,
    "ts_ignore_comments": $TS_IGNORE
  },
  "progress": {
    "critical_blockers": $ERRORS,
    "quality_issues": $WARNINGS
  }
}
EOF
    ;;
    
  summary)
    echo "=== Build Validation Summary ==="
    echo "Timestamp: $TIMESTAMP"
    echo "Build Status: $BUILD_STATUS"
    echo ""
    echo "Total Problems: $TOTAL_PROBLEMS ($ERRORS errors, $WARNINGS warnings)"
    echo ""
    echo "Error Categories:"
    echo "  • Explicit 'any' types: $EXPLICIT_ANY"
    echo "  • Unused variables: $UNUSED_VARS"  
    echo "  • React Hook deps: $HOOK_DEPS"
    echo "  • Variable declarations: $PREFER_CONST"
    echo "  • TypeScript ignore: $TS_IGNORE"
    echo ""
    if [ "$BUILD_STATUS" = "FAILING" ]; then
      echo "❌ Build is FAILING - $ERRORS errors must be fixed"
    else
      echo "✅ Build is PASSING - Only $WARNINGS warnings remain"
    fi
    ;;
    
  detailed)
    echo "=== Detailed Build Validation Report ==="
    echo "Generated: $TIMESTAMP"
    echo "Status: $BUILD_STATUS"
    echo ""
    echo "=== Error Breakdown ==="
    echo "Total Problems: $TOTAL_PROBLEMS"
    echo "  - Errors (block build): $ERRORS" 
    echo "  - Warnings (allow build): $WARNINGS"
    echo ""
    echo "=== Category Analysis ==="
    echo "1. Explicit 'any' Types: $EXPLICIT_ANY instances"
    echo "   Impact: High - Defeats TypeScript type safety"
    echo ""
    echo "2. Unused Variables: $UNUSED_VARS instances"
    echo "   Impact: Medium - Code quality and maintainability"
    echo ""
    echo "3. React Hook Dependencies: $HOOK_DEPS instances"
    echo "   Impact: High - Can cause runtime bugs"
    echo ""
    echo "4. Variable Declarations: $PREFER_CONST instances"
    echo "   Impact: Low - Code style consistency"
    echo ""
    echo "5. TypeScript Ignore Comments: $TS_IGNORE instances"
    echo "   Impact: Medium - Should use proper error handling"
    echo ""
    echo "=== Top Problem Files ==="
    echo "Files with most issues:"
    grep -E "^/.*\.(ts|tsx|js|jsx)$" "$TEMP_LOG" | sort | uniq -c | sort -nr | head -5 | while read count file; do
      echo "  $file: $count issues"
    done
    echo ""
    echo "=== Next Steps ==="
    if [ "$ERRORS" -gt 0 ]; then
      echo "1. Fix $EXPLICIT_ANY explicit 'any' types (priority: high)"
      echo "2. Fix $HOOK_DEPS React Hook dependencies (priority: high)"
      echo "3. Clean up $UNUSED_VARS unused variables (priority: medium)"
      echo "4. Fix $PREFER_CONST variable declarations (priority: low)"
      echo "5. Update $TS_IGNORE ignore comments (priority: medium)"
    else
      echo "🎉 All critical errors fixed! Only warnings remain."
      echo "Consider fixing remaining $WARNINGS warnings for code quality."
    fi
    ;;
esac

# Clean up
rm -f "$TEMP_LOG"

exit $EXIT_CODE