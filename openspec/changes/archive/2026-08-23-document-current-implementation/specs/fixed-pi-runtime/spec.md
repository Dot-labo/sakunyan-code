## ADDED Requirements

### Requirement: Fixed pi dependency
The project SHALL declare an exact `@earendil-works/pi-coding-agent` version and require Node.js 22.19.0 or newer.

#### Scenario: Supported Node.js
- **WHEN** Node.js is at least 22.19.0
- **THEN** sakunyan SHALL continue to pi startup

#### Scenario: Unsupported Node.js
- **WHEN** Node.js is older than 22.19.0
- **THEN** sakunyan SHALL stop and show the current and required versions in Japanese

### Requirement: Sakunyan controls resource loading
The launcher SHALL disable project-discovered extensions, skills, and prompt templates, while explicitly loading the sakunyan display extension.

#### Scenario: Startup resources
- **WHEN** sakunyan starts pi
- **THEN** project Skills and Extensions SHALL not be auto-loaded and the sakunyan extension SHALL be loaded as a hidden extension

### Requirement: Tool allowlist
The launcher SHALL enable `read`, `grep`, `find`, `ls`, and `bash` as the active pi tools.

#### Scenario: Tool availability
- **WHEN** the model starts a session through sakunyan
- **THEN** those five tools SHALL be available and `write` and `edit` SHALL not be enabled by the tool allowlist
