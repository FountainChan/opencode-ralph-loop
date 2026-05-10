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

## 📦 安装

### 方式一：本地路径安装（推荐，开发用）

```bash
cd ~/.cache/opencode
npm install /path/to/ralph-loop
```

> 💡 这会创建符号链接，修改源码后无需重新安装，改动实时生效。

### 方式二：GitHub 仓库安装

```bash
cd ~/.cache/opencode
npm install FountainChan/opencode-ralph-loop
```

### 方式三：直接文件路径（备选）

如果 npm 方式有问题，可直接在 `opencode.json` 的 `plugin` 字段引用 JS 文件路径：

```json
{
  "plugin": [
    "file:///path/to/ralph-loop/src/index.js"
  ]
}
```

### 配置

在 `~/.config/opencode/opencode.json` 中添加插件：

```json
{
  "plugin": ["ralph-loop"]
}
```

如果需要使用 ebuilder agent（自动续写），额外添加 agent 配置：

```json
{
  "agent": {
    "ebuilder": {
      "mode": "primary",
      "description": "Autonomous agent with auto-continuation.",
      "prompt": "You are ebuilder..."
    }
  }
}
```

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
