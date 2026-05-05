# opencode-ralph-loop

A lightweight [OpenCode](https://opencode.ai) plugin that implements the [Ralph Loop](https://ghuntley.com/ralph/) pattern — a self-referential completion loop that keeps your AI agent working until a task is truly 100% done.

Inspired by the Ralph Loop feature in [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode), reimplemented as a standalone plugin with zero dependencies.

## How It Works

```
User issues /ralph-loop or /ulw-loop command
  → Plugin writes loop state to .ralph-loop.state.json
  → Agent executes the task
  → session.idle event fires
  → Plugin checks Agent output for <promise>DONE</promise>
    → Found: Loop complete! Toast notification.
    → Not found: Inject continuation prompt → Agent continues
    → Repeat until completion or max iterations
```

## Features

- **`/ralph-loop`** — Standard completion loop (max 100 iterations)
- **`/ulw-loop`** — Ultrawork mode with maximum intensity (max 500 iterations)
- **`/cancel-ralph`** — Cancel an active loop
- **Completion promise detection** — Scans Agent output for `<promise>DONE</promise>`
- **Toast notifications** — Real-time iteration and completion updates
- **In-flight protection** — Prevents duplicate idle event handling
- **Custom parameters** — `--max-iterations=N` and `--completion-promise=TEXT`

## Installation

### Global (recommended)

```bash
# Copy the plugin file
cp ralph-loop.js ~/.config/opencode/plugins/ralph-loop.js
```

Then add to your `opencode.json`:

```json
{
  "plugin": ["./plugins/ralph-loop.js"]
}
```

### Project-level

```bash
# Copy to your project's .opencode/plugins/ directory
mkdir -p .opencode/plugins
cp ralph-loop.js .opencode/plugins/ralph-loop.js
```

## Usage

```bash
# Start a standard loop
/ralph-loop "Refactor the auth module and ensure all tests pass"

# Start an ultrawork loop (maximum intensity)
/ulw-loop "Migrate all API clients to v2"

# With custom parameters
/ralph-loop "Build the dashboard" --max-iterations=50 --completion-promise=SHIPPED

# Cancel an active loop
/cancel-ralph
```

## How the Agent Signals Completion

When the Agent has fully completed the task, it outputs:

```xml
<promise>DONE</promise>
```

The plugin detects this tag in the Agent's response and stops the loop. You can customize the promise text with `--completion-promise`.

## Configuration

No configuration file needed. The loop state is stored in `.ralph-loop.state.json` in the project directory and automatically cleaned up when the loop completes or is cancelled.

## Comparison with oh-my-opencode

| Feature | oh-my-opencode | opencode-ralph-loop |
|---------|---------------|-------------------|
| File count | ~25 TypeScript files | 1 JS file |
| Dependencies | Full OmO plugin | Zero dependencies |
| Oracle verification | ✅ | ❌ |
| Session reset strategy | ✅ | ❌ (continue only) |
| Session recovery | ✅ | ❌ |
| Race condition mutex | ✅ (debounce) | ✅ (inFlight Set) |
| `/ralph-loop` | ✅ | ✅ |
| `/ulw-loop` | ✅ | ✅ |
| `/cancel-ralph` | ✅ | ✅ |
| Toast notifications | ✅ | ✅ |
| Custom max iterations | ✅ | ✅ |
| Custom completion promise | ✅ | ✅ |

## License

MIT
