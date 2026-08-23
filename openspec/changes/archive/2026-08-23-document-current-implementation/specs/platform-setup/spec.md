## ADDED Requirements

### Requirement: macOS setup guide
The README SHALL provide concise macOS setup steps for installing Node.js, installing project dependencies, building, linking, and starting sakunyan.

#### Scenario: macOS student setup
- **WHEN** a student follows the macOS guide
- **THEN** the student SHALL have commands for `npm install`, `npm run build`, `npm link`, and `sakunyan .`

### Requirement: Windows Git Bash setup guide
The README SHALL identify Git for Windows/Git Bash as the Windows shell and include a Git Bash path example.

#### Scenario: Windows student setup
- **WHEN** a Windows student follows the guide in Git Bash
- **THEN** the student SHALL see a usable `/c/Users/...` path example and the same build and launch flow

### Requirement: API key setup guide
The README SHALL explain that the student needs a teacher-provided OpenRouter API key and SHALL document `/login openrouter` and `/model`.

#### Scenario: API key is not configured
- **WHEN** the student has started sakunyan without a configured model
- **THEN** the guide SHALL direct the student to `/login openrouter`, select API-key login, enter the teacher-provided key, and choose a model with `/model`

### Requirement: Setup troubleshooting
The README SHALL include concise guidance for command-not-found, missing-folder, unavailable-model, and outdated-Node.js cases.

#### Scenario: Setup problem
- **WHEN** a student encounters a listed setup problem
- **THEN** the README SHALL provide one direct verification or recovery action
