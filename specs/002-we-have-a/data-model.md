# Data Model: TypeScript Error Classifications

## Error Types

### TypeScriptError
Represents a compilation error that prevents successful builds.

**Fields**:
- `file`: string - Path to the file containing the error
- `line`: number - Line number where error occurs  
- `column`: number - Column position of the error
- `code`: string - TypeScript error code (e.g., "TS2345")
- `message`: string - Human-readable error description
- `severity`: "error" | "warning" - Impact level on build process
- `category`: ErrorCategory - Classification of the error type

**Validation Rules**:
- `file` must be a valid file path within the project
- `line` and `column` must be positive integers
- `code` must follow TypeScript error code format
- `severity` "error" blocks builds, "warning" allows builds to continue

### ESLintViolation  
Represents code quality issues caught by ESLint rules.

**Fields**:
- `file`: string - Path to the file containing the violation
- `line`: number - Line number of the violation
- `column`: number - Column position  
- `ruleId`: string - ESLint rule identifier (e.g., "@typescript-eslint/no-explicit-any")
- `message`: string - Violation description
- `severity`: 1 | 2 - ESLint severity level (1=warning, 2=error)
- `fixable`: boolean - Whether ESLint can auto-fix the violation

**Validation Rules**:
- `ruleId` must be a valid ESLint rule name
- `severity` 2 blocks builds in our configuration
- `fixable` violations can be resolved with `eslint --fix`

### TypeDefinition
Represents proper TypeScript types that replace `any` usage.

**Fields**:
- `name`: string - Interface or type name
- `definition`: string - TypeScript type definition
- `usage`: string[] - List of files where this type is used
- `complexity`: "simple" | "complex" | "generic" - Type complexity level

**Validation Rules**:
- `name` must follow TypeScript identifier rules
- `definition` must be valid TypeScript syntax
- `complexity` determines implementation approach

## Error Categories

### ExplicitAnyError
Locations where `any` type is explicitly used instead of proper typing.

**Properties**:
- High priority for fixing (blocks type safety)
- Can often be replaced with union types or generics
- Common in test files and API response handling

### UnusedVariableError  
Variables or imports declared but never referenced.

**Properties**:
- Medium priority (code quality issue)
- Safe to remove if truly unused
- May indicate incomplete implementation

### HookDependencyError
React hooks missing required dependencies in arrays.

**Properties**:
- High priority (can cause runtime bugs)
- ESLint provides specific guidance for fixes
- Critical for React component correctness

### DeclarationError
Incorrect `let` vs `const` usage for variables.

**Properties**:
- Low priority (style issue)
- Easy to fix automatically
- Improves code readability

## State Transitions

### Error Lifecycle
1. **Detected**: Error found in build/lint process
2. **Categorized**: Classified by type and severity  
3. **Prioritized**: Ordered by impact on build success
4. **Fixed**: Code changed to resolve the error
5. **Verified**: Build/lint passes after fix
6. **Validated**: Functionality confirmed unchanged

### Batch Processing
- Group similar errors by file for efficient fixing
- Process high-severity errors first
- Validate after each batch to catch regressions

## Relationships

### FileErrorMapping
Each source file can contain multiple errors of different types.

- One file → Many TypeScript errors
- One file → Many ESLint violations  
- Errors in same file should be fixed together for efficiency

### ErrorDependencies
Some errors may be related or have dependencies:

- Fixing unused imports may resolve unused variable warnings
- Adding proper types may resolve multiple `any` violations
- Hook dependency fixes may require type updates

### ValidationChain
Fixes must be validated in order:

1. TypeScript compilation must pass
2. ESLint rules must pass
3. Tests must continue passing
4. Application must function correctly