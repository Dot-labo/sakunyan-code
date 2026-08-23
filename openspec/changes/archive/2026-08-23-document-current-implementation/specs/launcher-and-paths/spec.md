## ADDED Requirements

### Requirement: Target folder is explicit
The launcher SHALL require a target folder argument before starting pi.

#### Scenario: No target folder
- **WHEN** the user runs `sakunyan` without an argument
- **THEN** the launcher SHALL stop before starting pi and explain how to run `sakunyan .`

### Requirement: Existing directory is used as working directory
The launcher SHALL resolve the target path, verify that it is a directory, change to it, and start pi with that directory as the working directory.

#### Scenario: Relative current directory
- **WHEN** the user runs `sakunyan .` from an existing folder
- **THEN** pi SHALL start in that folder

#### Scenario: Missing path
- **WHEN** the target path does not exist
- **THEN** the launcher SHALL stop and show the current directory, resolved target, and path examples

### Requirement: Home path is explicit
The launcher SHALL support `~` and home-relative paths when they resolve to an existing directory.

#### Scenario: Home directory
- **WHEN** the user runs `sakunyan ~`
- **THEN** pi SHALL start in the user's home directory
