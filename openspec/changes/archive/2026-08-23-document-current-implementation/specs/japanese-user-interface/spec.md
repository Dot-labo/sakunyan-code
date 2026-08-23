## ADDED Requirements

### Requirement: Japanese welcome and working-directory display
The TUI SHALL show a Japanese sakunyan welcome message, the sakunyan version, and the active working directory.

#### Scenario: Session starts
- **WHEN** the interactive session starts
- **THEN** the header SHALL show the sakunyan version and working directory in Japanese

### Requirement: Friendly status messages
The TUI SHALL show friendly Japanese status messages for waiting, thinking, file inspection, and command execution.

#### Scenario: Waiting for a question
- **WHEN** the session is idle
- **THEN** the status SHALL show `🐱 質問を入力してね（Ctrl+Cを2回で終了）`

#### Scenario: Processing
- **WHEN** a turn or tool call is running
- **THEN** the status SHALL use `🐈` and describe the current activity

### Requirement: ASCII logo
The TUI SHALL show a generated ASCII-art `Sakunyan Code` logo during startup.

#### Scenario: Header renders
- **WHEN** the sakunyan header is rendered
- **THEN** the header SHALL include the configured AA logo without requiring a separate logo service

### Requirement: Centralized messages and colors
User-facing Japanese messages SHALL be centralized, and colors SHALL communicate guidance, current information, success, and errors consistently.

#### Scenario: Color-disabled output
- **WHEN** output is not an interactive color-capable terminal or `NO_COLOR` is set
- **THEN** messages SHALL remain readable without ANSI color codes
