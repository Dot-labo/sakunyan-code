## ADDED Requirements

### Requirement: Educational purpose
The default system prompt SHALL direct the agent to prioritize error resolution, question resolution, and user understanding.

#### Scenario: User asks a question
- **WHEN** a user submits a question
- **THEN** the agent SHALL answer briefly, clearly, and in language understandable to a child, explaining unfamiliar terms

### Requirement: Explain commands before instruction
The agent SHALL explain what a command means before telling the user how to run it.

#### Scenario: Command is useful
- **WHEN** a command would help the user
- **THEN** the response SHALL explain the command's purpose and then show the execution method

### Requirement: Do not perform state-changing operations automatically
The default prompt SHALL instruct the agent not to perform file changes, commits, pushes, or branch-changing operations on the user's behalf.

#### Scenario: User asks for a Git operation
- **WHEN** the user asks to commit, push, or otherwise change repository state
- **THEN** the agent SHALL explain the operation and provide instructions for the user to execute it

### Requirement: Investigation tools are available
The educational mode SHALL support reading, searching, listing, and bash-based investigation while relying on the prompt for the interaction policy.

#### Scenario: Investigating an error
- **WHEN** the user asks why something is failing
- **THEN** the agent SHALL be able to inspect relevant files and run suitable investigation commands before explaining the cause
