# OpenSpec AI Agent Instructions

This project uses OpenSpec for specification-driven development. AI assistants should follow these guidelines when working with this codebase.

## OpenSpec Workflow

### Creating Changes
When asked to implement a new feature or modification:

1. **Create a change proposal** in `openspec/changes/feature-name/`
   - `proposal.md` - Why and what we're changing
   - `tasks.md` - Implementation checklist
   - `design.md` - Technical decisions (optional)
   - `specs/` - Spec deltas showing additions/modifications

2. **Use proper spec format**:
   - Requirements use `### Requirement: <name>`
   - Scenarios use `#### Scenario: <description>`
   - Use SHALL/MUST in requirement text
   - Deltas show ADDED/MODIFIED/REMOVED sections

### Working with Specs
- Current system specs are in `openspec/specs/`
- Proposed changes are in `openspec/changes/`
- Always validate specs with `openspec validate <change>`
- Archive completed changes with `openspec archive <change>`

### Available Commands
- `openspec list` - View active changes
- `openspec show <change>` - Display change details
- `openspec validate <change>` - Check spec formatting
- `openspec archive <change>` - Archive completed change

## Project Context

This is an SLM Business Layer with:
- Human-in-the-loop training system
- Multi-model fallback (phi3:mini → qwen2.5:1.5b → llama3.2:1b)
- NeonDB cloud database (11 tables)
- MCP (Model Context Protocol) system
- JWT authentication
- Real-time analytics

## Spec Structure

Current specs cover:
- **Training System**: Rating, feedback, improvements
- **Database**: Schema, persistence, statistics
- **API**: Endpoints, authentication, responses
- **MCP**: Servers, routing, context
- **Security**: JWT, validation, RBAC
- **System**: Architecture, deployment, monitoring

When creating changes, reference existing specs and create appropriate deltas.
