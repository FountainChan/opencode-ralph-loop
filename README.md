# 🔁 opencode-ralph-loop

**[English](README.md)** · **[简体中文](README_CN.md)**

A lightweight [OpenCode](https://opencode.ai) plugin that implements the [Ralph Loop](https://ghuntley.com/ralph/) pattern — a self-referential completion loop that keeps your AI agent working until a task is truly 100% done.

Also includes **ebuilder agent** support — switch to the ebuilder agent and auto-continuation activates automatically, no commands needed.

Inspired by the Ralph Loop and Sisyphus features in [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode), reimplemented as a standalone plugin with **zero dependencies**.

---

## 🔄 How It Works

### Ralph Loop (command-based)

```
User issues /ralph-loop or /ulw-loop command
  → Plugin writes loop state to .ralph-loop.state.json
  → Agent executes the task
  → session.idle event fires
  → Plugin checks Agent output for <promise>DONE</promise>
    → ✅ Found: Loop complete! Toast notification.
    → ❌ Not found: Inject continuation prompt → Agent continues
    → Repeat until completion or max iterations
```

### ebuilder Agent (automatic)

```
User switches to ebuilder agent in TUI
  → chat.message hook detects agent === "ebuilder"
  → Plugin writes loop state to .ebuilder.state.json
  → Agent executes the task
  → session.idle event fires
  → Plugin checks Agent output for <promise>DONE</promise>
    → ✅ Found: Loop complete!
    → ❌ Not found: Inject continuation prompt → Agent continues
  → User switches back to build/plan → ebuilder state auto-cleared → Loop stops
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔁 **`/ralph-loop`** | Standard completion loop (max 100 iterations) |
| 🚀 **`/ulw-loop`** | Ultrawork mode with maximum intensity (max 500 iterations) |
| 🛑 **`/cancel-ralph`** | Cancel an active loop (works for both modes) |
| 🤖 **ebuilder agent** | Auto-continuation when switched to ebuilder agent (max 500 iterations) |
| 🎯 **Completion promise detection** | Scans Agent output for `<promise>DONE</promise>` |
| 🔔 **Toast notifications** | Real-time iteration and completion updates |
| 🛡️ **In-flight protection** | Prevents duplicate idle event handling |
| ⚙️ **Custom parameters** | `--max-iterations=N` and `--completion-promise=TEXT` |

---

## 📦 Installation

### Option 1: npm (recommended)

Add to your `opencode.json`:

```json
{
  "plugin": ["ralph-loop"]
}
```

OpenCode installs the plugin automatically at startup via Bun.

### Option 2: Global (copy to plugins directory)

```bash
# Copy the plugin file
cp src/index.js ~/.config/opencode/plugins/ralph-loop.js
```

Then add to your `opencode.json`:

```json
{
  "plugin": ["./plugins/ralph-loop.js"],
  "agent": {
    "ebuilder": {
      "mode": "primary",
      "description": "Autonomous agent with auto-continuation. Switch to this agent for tasks that need to run without stopping.",
      "prompt": "You are ebuilder, an autonomous coding agent that works continuously without stopping.\n\nRULES:\n- Work continuously until the task is FULLY complete\n- When you need to use a skill, invoke it directly (e.g., /ce:brainstorm, /ce:plan, /ce:work)\n- Do NOT ask the user for permission to continue — just keep working\n- Do NOT pause to summarize or wait for confirmation\n- When you encounter errors, fix them yourself and keep going\n- When the ENTIRE task is FULLY complete and verified, output: <promise>DONE</promise>\n- Do NOT output the promise until everything is truly done\n- Output the promise ONLY ONCE when truly done",
      "color": "#FF6600",
      "steps": 200
    }
  }
}
```

### Option 3: Project-level

```bash
# Copy to your project's .opencode/plugins/ directory
mkdir -p .opencode/plugins
cp src/index.js .opencode/plugins/ralph-loop.js
```

### Option 4: Manual cache install (no npm publish)

Download the packaged plugin from [GitHub Releases](https://github.com/FountainChan/opencode-ralph-loop/releases), then extract it directly into OpenCode's npm cache:

```bash
# 1. Download the tarball from GitHub Releases (e.g. ralph-loop-1.0.0.tar.gz)

# 2. Extract to OpenCode's npm cache directory
mkdir -p ~/.cache/opencode/node_modules
tar xzf ralph-loop-1.0.0.tar.gz -C ~/.cache/opencode/node_modules/

# 3. Add to opencode.json
```

Add to your `opencode.json`:

```json
{
  "plugin": ["ralph-loop"]
}
```

> 💡 **How it works**: OpenCode loads npm plugins from `~/.cache/opencode/node_modules/`. By placing a properly structured package directory there, OpenCode treats it as an installed npm package — showing a clean name instead of a file path. No actual npm publish needed.
>
> 📦 **Auto packaging**: Every time a new `v*` tag is pushed, GitHub Actions automatically packages the plugin and creates a Release with the tarball attached. Just run `git tag v1.0.0 && git push --tags` to trigger it.

---

## 🎮 Usage

### 🤖 ebuilder Agent (recommended for long tasks)

1. Switch to the **ebuilder** agent in the TUI (Tab key or agent selector)
2. Type your task normally
3. The agent will work continuously without stopping
4. Switch back to **build** to stop auto-continuation

### 🔁 Ralph Loop Commands

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

### 🏁 How the Agent Signals Completion

When the Agent has fully completed the task, it outputs:

```xml
<promise>DONE</promise>
```

The plugin detects this tag in the Agent's response and stops the loop. You can customize the promise text with `--completion-promise`.

---

## ⚙️ Configuration

No configuration file needed. Loop states are stored in `.ralph-loop.state.json` and `.ebuilder.state.json` in the project directory and automatically cleaned up when loops complete or are cancelled.

---

## 📊 Comparison with oh-my-opencode

| Feature | oh-my-opencode | opencode-ralph-loop |
|---------|---------------|-------------------|
| 📁 File count | ~25 TypeScript files | 1 JS file |
| 📦 Dependencies | Full OmO plugin | Zero dependencies |
| 👁️ Oracle verification | ✅ | ❌ |
| 🔄 Session reset strategy | ✅ | ❌ (continue only) |
| 🔧 Session recovery | ✅ | ❌ |
| 🛡️ Race condition mutex | ✅ (debounce) | ✅ (inFlight Set) |
| 🔁 `/ralph-loop` | ✅ | ✅ |
| 🚀 `/ulw-loop` | ✅ | ✅ |
| 🛑 `/cancel-ralph` | ✅ | ✅ |
| 🤖 ebuilder/Sisyphus agent | ✅ (Sisyphus) | ✅ (ebuilder) |
| ⏩ Auto-continuation on agent switch | ✅ | ✅ |
| 🔔 Toast notifications | ✅ | ✅ |
| ⚙️ Custom max iterations | ✅ | ✅ |
| 🎯 Custom completion promise | ✅ | ✅ |

---

## 📄 License

MIT
