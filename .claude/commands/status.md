# Check Agent Status

Read the current progress file and provide a status update.

## Steps

1. Read `claude-progress.txt`
2. Check `git log --oneline -10` for recent activity
3. Check `git status` for uncommitted changes

## Report Format

Provide a concise status report including:
- **Current Task**: What is being worked on
- **Status**: Current phase (IDLE, IN_PROGRESS, BLOCKED, COMPLETE)
- **Context Window**: Which session number we're on
- **Recent Progress**: What was done in the last session(s)
- **Next Steps**: What needs to happen next
- **Blockers**: Any issues preventing progress
