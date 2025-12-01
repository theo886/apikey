# Coding Agent - Continue Work

You are CONTINUING work on an existing task. Read the progress file to understand the current state before doing anything else.

## Critical First Steps

1. **READ `claude-progress.txt` IMMEDIATELY** - This contains:
   - What task you're working on
   - What has been completed
   - What needs to be done next
   - Any blockers or important notes

2. **Check git state**:
   ```
   git log --oneline -5
   git status
   ```

## Your Responsibilities

1. **Understand Context**: Read progress file and recent git history
2. **Continue Work**: Pick up where the last session left off
3. **Document Progress**: Update the progress file regularly
4. **Prepare Handoff**: Leave clear notes for the next session

## Working Pattern

### At the Start
- Read `claude-progress.txt`
- Increment the context window counter
- Add a new session entry to the history

### While Working
- Complete tasks from "Next Steps"
- Move completed items to "Completed Steps"
- Update "Current State" checkboxes
- Note any new blockers discovered

### Before Ending
- Update progress file with current state
- Write detailed "Notes for Next Session"
- Commit all changes with clear messages
- Push to the branch

## Progress File Updates

When updating `claude-progress.txt`, include:
- What you accomplished this session
- What's still pending
- Any issues or blockers
- Clear instructions for the next session

## Output Format

At the end of your session, provide:
1. Summary of what was accomplished
2. Current state of the task
3. What the next session should focus on
4. Any blockers or concerns

---
Additional context (if any): $ARGUMENTS
