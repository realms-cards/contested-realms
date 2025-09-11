# Sorcery Client TypeScript Constitution

## Core Principles

### I. Type Safety First (NON-NEGOTIABLE)
**Zero tolerance for `any` types.** Every value must have explicit, meaningful types. The `@typescript-eslint/no-explicit-any: "error"` rule enforces this constitutionally.

**Violations include:**
- Using `any` type annotations: `function foo(data: any)` ❌
- Casting to `any`: `value as any` ❌ 
- Destructuring from `any`: `const { prop } = anyValue` ❌

**Acceptable alternatives:**
- Proper interface definitions: `interface TournamentData { id: string; name: string; }`
- Generic constraints: `function process<T extends Record<string, unknown>>(data: T)`
- Type assertions to specific types: `value as TournamentInfo`
- Union types: `string | number | boolean`
- `unknown` for truly unknown data that gets type guarded

### II. Strict TypeScript Configuration
**All strict TypeScript compiler options must remain enabled:**
- `strict: true` - Master strict mode switch
- `noImplicitAny: true` - No implicit any types 
- `noImplicitReturns: true` - All code paths must return values
- `noImplicitThis: true` - `this` context must be explicit
- `noFallthroughCasesInSwitch: true` - Switch cases must break/return
- `useUnknownInCatchVariables: true` - Catch variables default to `unknown`

**Constitutional violation:** Disabling any of these settings without documented justification and alternative type safety measures.

### III. Import Organization & Code Quality
**Import order must follow ESLint `import/order` rule:**
1. Built-in modules (Node.js)
2. External packages (npm/yarn) 
3. Internal packages (workspace)
4. Parent directory imports
5. Sibling directory imports
6. Index imports

**Code quality rules (error-level):**
- `prefer-const: "error"` - Use `const` for immutable values
- `object-shorthand: "error"` - Use ES6 object shorthand syntax
- `@typescript-eslint/no-unused-vars: "warn"` - No unused variables (warning to allow development)

### IV. Interface Design & Type Compatibility  
**All interfaces must be compatible across boundaries:**
- API response types must match frontend expectations
- Socket event types must align between client and server
- Component props must match their usage patterns

**Type mapping required when:**
- Converting between external library types and internal types
- Bridging protocol differences (e.g., `TournamentFormat` vs API format)
- Transforming data between layers (API ↔ UI ↔ Socket)

### V. Build-First Development
**No code merges until build passes cleanly:**
- TypeScript compilation: 0 errors
- ESLint: 0 errors (warnings acceptable)  
- Tests: All passing
- Type validation: All strict rules satisfied

**Critical error categories that block merges:**
- `@typescript-eslint/no-explicit-any` violations
- TypeScript compilation failures
- Missing interface properties
- Type compatibility mismatches

## Development Workflow Standards

### Type Definition Process
1. **Interface First:** Define TypeScript interfaces before implementation
2. **Validation Schema:** Use Zod or similar for runtime validation
3. **Documentation:** JSDoc comments for complex type relationships
4. **Testing:** Type tests for critical interfaces

### Error Recovery Patterns
**When encountering type errors:**
1. **Investigate:** Understand the root type mismatch
2. **Define:** Create proper interfaces/types
3. **Transform:** Use mapping functions, not `any` casts
4. **Validate:** Ensure type safety is maintained

**Forbidden quick fixes:**
- Adding `// @ts-ignore` comments
- Casting to `any` to bypass errors
- Disabling TypeScript rules temporarily
- Using `unknown` without type guards

### Code Review Requirements
**All PRs must verify:**
- [ ] No `any` types introduced
- [ ] Import order follows ESLint rules
- [ ] All TypeScript strict mode rules respected
- [ ] Build passes with 0 TypeScript errors
- [ ] Type compatibility across interfaces maintained

## Technical Constraints

### Framework Alignment
**ESLint configuration is constitutional law:**
- Rules marked `"error"` cannot be violated
- Rules marked `"warn"` should be addressed but don't block
- New rules require constitutional amendment process

**Current error-level rules:**
```javascript
"@typescript-eslint/no-explicit-any": "error"
"prefer-const": "error"
"object-shorthand": "error"
"no-var": "error"
```

### Performance Standards
**Build time requirements:**
- TypeScript compilation: <30 seconds
- ESLint checking: <10 seconds  
- Type checking regression: <5% increase per feature

## Governance

**Constitution supersedes all other practices.** When in conflict, TypeScript type safety and ESLint error rules take precedence over convenience, speed, or legacy patterns.

**Amendment Process:**
1. Document recurring pain points with current rules
2. Propose specific rule changes with justification
3. Implement with migration plan for existing code
4. Update templates and documentation
5. Increment constitution version

**Enforcement:**
- Build pipeline enforces all error-level rules
- Code reviews verify constitutional compliance  
- Regression tests protect against type safety erosion

**Emergency Exceptions:** Only for production-critical bugs where type safety cannot be immediately achieved. Must include:
- Detailed technical justification
- Timeline for proper resolution  
- Tracking issue for constitutional compliance restoration

**Version**: 2.2.0 | **Ratified**: 2025-01-11 | **Last Amended**: 2025-01-11