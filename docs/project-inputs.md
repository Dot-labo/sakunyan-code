# Issue #35: project inputs and pi trust

## Scope

Use design A: no project-specific configuration. Do not introduce project
`.sakunyan/` settings. Keep the target working directory, read-only tools, and
user-wide `~/.sakunyan/settings.json` persistence. This is not an OS sandbox;
explicitly asking a read tool to read a file is still permitted.

Verified with sakunyan 0.1.19, pinned pi 0.84.2, on Linux/WSL. Native macOS and
Windows terminal behavior has **not** been verified.

## Before the fix

A real PTY launch with an isolated HOME and harmless local `.pi` fixtures showed:

| Path | Result |
| --- | --- |
| Initial sakunyan launch | English `This project is not trusted … /trust … restart pi` notice |
| Submit `/trust`, select Trust | Built-in selector is available; saves an absolute/canonical project path in `~/.sakunyan/trust.json` |
| Restart sakunyan | Still ignores project settings/packages/resources: the launcher's final `--no-approve` overrides saved trust, including parent trust |
| Explicit `--extension`, `--skill`, `--prompt-template`, `--system-prompt` | **Bypasses** the corresponding `--no-*` auto-discovery flags; the harmless extension executes, local package resources load, and project instructions enter the prompt |
| Bare pi with the saved trust decision | Loads `.pi/settings.json`, package resources, extensions, skills, prompts, `AGENTS.md`, and `.pi/SYSTEM.md` |

Thus `/trust` did not itself undo sakunyan's final `--no-approve`, but it exposed
an inappropriate UI and persisted a decision. There was also a distinct explicit
resource-path bypass. The fixed tool allowlist still won in the old launcher.

The pinned implementation was inspected locally:

- `dist/main.d.ts`: `MainOptions` accepts inline extension factories, **not**
  settings, loader, or runtime factory injection.
- `dist/main.js`: calls `runMigrations(cwd)` before creating cwd-bound settings
  and the trust store. `dist/migrations.js` renames legacy project `.pi/commands/`
  to `.pi/prompts/`; the SDK host never enters that migration path. A permanent
  runtime test verifies startup, `/reload`, and `/new` leave legacy commands intact.
  The original host also resolves session directories from CLI, environment, and
  cwd-bound settings; this host uses only CLI, allowed environment, and global settings.
- `dist/core/trust-manager.js`: `trust.json`, canonical paths, nearest saved
  ancestor decision; detects cwd `.pi` resources and ancestor `.agents/skills`.
- `dist/core/resource-loader.js`: resolves packages before the `noExtensions` /
  `noSkills` / `noPromptTemplates` filters; explicit paths survive those flags.
- `dist/core/package-manager.js`: trusted cwd `.pi` resources and ancestor
  `.agents/skills`; global/user resources are separate.
- `dist/modes/interactive/interactive-mode.js`: built-in `/trust` dispatches
  **before** extension slash commands or extension input events.

## Implementation

`src/runtime.ts` uses the public SDK runtime factory / service APIs. Every initial,
new, resumed, forked, or imported runtime uses the same fixed resource policy:
empty in-memory resource settings, `projectTrusted: false`, no automatic external
resources, no extra CLI resource paths, no context files, and no discovered system
or appended prompt files. Only bundled inline factories are loaded. No upstream
patch, source transformation, stdout filtering, or project directory substitution
is used.

`src/global-settings.ts` injects a global-only `SettingsStorage` through
`SettingsManager.fromStorage()`. Its project scope has no backend at all. The
global scope uses `settings.json` with pi-compatible `proper-lockfile` locking.
This preserves global setting reads/writes without ever reading project settings.
Its default trusted state means pi has no trust warning to render; this is **not**
a permission to discover project inputs: the resource loader has a separate,
permanently untrusted empty manager. No `ProjectTrustStore` is constructed and no
`autoTrustOnReloadCwd` is supplied.

`src/project-policy.ts` uses the documented custom-editor and autocomplete APIs.
It removes `/trust` from completions and guards the normalized `onSubmit` callback
before pi's built-in handler, including global keybinding remaps and programmatic
submissions. The guard survives pi replacing the callback during editor changes.
An extension command named `trust` or an `input` handler alone would be too late.
All other submissions delegate unchanged to pi's callback and `CustomEditor`.

The launcher is a fixed SDK host, not an unrestricted pi forwarding wrapper:

| Compatibility | Behavior |
| --- | --- |
| Print/text/JSON, thinking, offline, API key, session name | Supported |
| Interactive verbose, TUI mode, initial built-in theme selection | Supported in the interactive host |
| `@file` attachments and initial prompts | Supported in interactive and print/JSON mode, with filename wrappers, tilde/path normalization and image attachments |
| `--no-session`, `--continue`, `--session <file>`, `--fork <file>` | Supported; session/fork require existing valid session files, not IDs/prefixes; mutually conflicting selection flags are rejected |
| `--session-dir`, `PI_CODING_AGENT_SESSION_DIR`, global `settings.sessionDir` | Supported, in that precedence order; project settings are never consulted |
| `--resume`/`-r`, `--list-models`, `--export`, `--session-id`, `--models` | Explicit unsupported-option error before settings/services/session creation |
| `--no-tools`, `--no-builtin-tools`, `--exclude-tools` (and aliases) | Explicit unsupported-option error rather than silently disregarding requests to disable tools |
| RPC | Supported protocol host; `--print` and positional messages/attachments are rejected, not discarded; send prompts through RPC |
| Resource/context/trust flags, `--provider`, `--model`, `--tools` | Accepted but deliberately cannot alter the fixed resource/trust/model/tool policy |
| Unknown or arbitrary extension flags | Explicit unknown-option error; package-management CLI is not delegated to pi `main()` |

Global settings load failures are surfaced with the settings file path before
session creation. pi 0.84.2 does **not** export its attachment processor through
its package's public entry point. The host reuses the pinned distribution's
`cli/file-processor.js` via a resolved module URL instead of reimplementing MIME,
image resizing and platform filename handling. This single compatibility adapter
needs revalidation on a pi version upgrade. Runtime/services/resource injection
continues to use public SDK APIs. Interactive `/resume` and other built-in UI
commands remain pi's implementations; cross-project switches rebuild the same
project-free runtime and `/reload` cannot enable discovered resources.

## Automated checks

```sh
npm run build
node --test test/project-inputs.test.js
npm test
npm run typecheck
```

The eleven project-policy runtime tests launch the compiled CLI with a disposable HOME,
real pi session/services/resource loader/TUI/editor, harmless file fixtures, and a
real read-tool execution. Only model completion / network fetch and terminal
capability are substituted in the portable automated harness. Filesystem tracing
delegates to real filesystem calls and asserts project, parent, and grandparent
resource directories are not inspected. Tests cover normal/remapped/programmatic
trust submission, completions, saved child/parent/always-trust decisions, explicit
CLI paths, `/reload`, `/new`, cross-project session switch plus reload, ordinary
submissions, target cwd/read tools, and global setting persistence.

`test/runtime-compat.test.js` adds an isolated SDK/print-host harness for attachments,
CLI/environment/global session-directory precedence, existing session/fork paths,
unknown session rejection, conflicting selections, explicit unsupported-option
errors, RPC startup validation, and malformed global settings. Its interactive
boundary captures the real host options; its print boundary captures prompts and
images delivered by the real `runPrintMode`. No provider request is made.
Normal `npm test` does not need Python or a PTY.

For an exact pre-fix comparison without changing production code:

```sh
PROJECT_PROBE_BASELINE=1 node --test test/project-inputs.test.js
```

This selects the recorded original launcher (`test/fixtures/project-input-baseline.js`)
and must fail the issue-specific checks; offline and global persistence remain
passing controls. The original eight-test suite was also verified by temporarily
restoring the old `main()` launcher in **production** `src/cli.ts`: 6 failed / 2
passed. Restored the fix afterward.

Strict RED→GREEN steps were executed separately for the English notice, `/trust`
submission, `/trust` completion, and offline flag preservation. The initial full
baseline was 47 passed / 1 failed: an unrelated test hardcoded the checkout name
`sakunyan-code/missing-folder`. That assertion now checks the actual target path.
The first implementation passed 58 tests. Independent-review regressions then
reproduced the remapped-submit bypass, ignored recognized actions, attachment and
tilde-path failure, ignored global session directory, unknown-session creation,
conflicting selection acceptance, and swallowed global settings errors before
fixing each behavior. After those fixes, `npm test` passed all 79 tests;
`npm run typecheck` and `git diff --check` also passed. Five separate production
sabotages disabled the submit boundary, unsupported-action rejection,
global/environment session-directory lookup, print images, and session-file
validation: each corresponding regression failed. All mutations were restored,
and the full suite was rerun successfully. Cross-project isolation is an added
preservation test; it already passed before these compatibility fixes.

The earlier audit reported three existing dependency advisories (pi-coding-agent,
brace-expansion, undici); their affected installed versions are unchanged from the
baseline lockfile.

## Local terminal evidence and native handoff

A real Linux PTY check used `test/fixtures/run-project-pty.py` and the same network
boundary fixture, without substituting TTY capability. Initial launch, trust
selection, restart, explicit-path bypass, bare pi with saved trust, and fixed
launch were all executed. JSON snapshots include the real loaded settings,
packages, resource lists, system prompt, tools, and read-tool result; PTY captures
retain the rendered terminal output. The review fix was additionally exercised
in three real Linux PTY launches (no fake TTY): normal Enter, global Ctrl+] submit
remap, and programmatic normalized submission. Each blocked `/trust` without a
selector/write while preserving ordinary `/name` submission and `/reload`.

The scratch evidence is recorded in the implementation handoff, not committed
because it contains machine-local absolute paths. All fixtures and outputs stayed
under `$TMPDIR`; no real API key or production service was used.

Native handoff: on macOS/Windows, use a disposable HOME and a harmless project with
`.pi/settings.json`, then launch `sakunyan <project>`. Expect no pi trust notice;
`/trust` must not open a selector or write `trust.json`. `/reload` and `/new` must
keep the same policy. This platform check is outstanding, not a claimed success.
