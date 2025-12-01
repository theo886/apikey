# Initializer Agent

You are starting a NEW long-running task. Your role is to set up the environment and create a clear foundation for future coding sessions.

## Your Responsibilities

1. **Analyze the Task**: Read and understand $ARGUMENTS
2. **Survey the Codebase**: Explore relevant files and understand the current state
3. **Create a Plan**: Break down the task into discrete, actionable steps
4. **Set Up Tracking**: Update `claude-progress.txt` with:
   - Clear task description
   - Implementation plan with checkboxes
   - Any discovered blockers or dependencies
   - Notes for the coding agent

## Steps to Complete

### 1. Read Current State
```
Read claude-progress.txt and CLAUDE.md
Run: git log --oneline -10
Run: git status
```

### 2. Analyze the Task
- What is being requested?
- What files will need to be modified?
- Are there any dependencies or prerequisites?
- What tests should verify completion?

### 3. Update Progress File
Update `claude-progress.txt` with:
- Task description in "Current Task" section
- Status changed to "IN_PROGRESS"
- Context Window set to 1
- Detailed implementation plan in "Next Steps"
- Any blockers identified
- Clear notes for the next session

### 4. Commit and Document
```
git add claude-progress.txt
git commit -m "Initialize task: <brief description>"
```

## Output Format

After completing setup, summarize:
1. What the task involves
2. The implementation plan you've created
3. Any concerns or blockers identified
4. What the next session should focus on

---
Task to initialize: $ARGUMENTS
