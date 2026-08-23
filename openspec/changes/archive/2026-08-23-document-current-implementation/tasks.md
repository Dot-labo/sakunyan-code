## 1. Record current implementation boundaries

- [x] 1.1 Verify the launcher path and argument behavior against `src/cli.ts`
- [x] 1.2 Verify the fixed pi version, Node.js requirement, and active tool allowlist against `package.json` and `src/cli.ts`
- [x] 1.3 Verify resource-loading flags and the sakunyan extension entry point

## 2. Record user-facing behavior

- [x] 2.1 Verify Japanese messages, colors, status icons, version display, and AA logo against `src/messages.ts` and `src/extension.ts`
- [x] 2.2 Verify educational response rules and command guidance against `src/educational-prompt.ts`
- [x] 2.3 Verify macOS, Windows Git Bash, API key, and troubleshooting instructions against `README.md`

## 3. Validate the documentation set

- [x] 3.1 Check that every capability in the proposal has a corresponding spec file
- [x] 3.2 Check that each requirement has at least one executable WHEN/THEN scenario
- [x] 3.3 Run the existing typecheck and test suite and record any implementation/spec mismatch
