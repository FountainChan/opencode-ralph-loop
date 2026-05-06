# 🔁 opencode-ralph-loop

**[English](README.md)** · **[简体中文](README_CN.md)**

轻量级 [OpenCode](https://opencode.ai) 插件，实现了 [Ralph Loop](https://ghuntley.com/ralph/) 模式——自我引用的完成循环，让你的 AI agent 持续工作直到任务 100% 完成。

同时支持 **ebuilder agent**——切换到 ebuilder agent 即可自动激活持续工作模式，无需任何命令。

灵感来自 [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) 中的 Ralph Loop 和 Sisyphus 功能，以**零依赖**独立插件形式重新实现。

---

## 🔄 工作原理

### Ralph Loop（命令模式）

```
用户输入 /ralph-loop 或 /ulw-loop 命令
  → 插件写入循环状态到 .ralph-loop.state.json
  → Agent 执行任务
  → session.idle 事件触发
  → 插件检查 Agent 输出是否包含 <promise>DONE</promise>
    → ✅ 找到：循环完成！Toast 通知。
    → ❌ 未找到：注入续写提示 → Agent 继续
    → 重复直到完成或达到最大迭代次数
```

### ebuilder Agent（自动模式）

```
用户在 TUI 切换到 ebuilder agent
  → chat.message hook 检测到 agent === "ebuilder"
  → 插件写入循环状态到 .ebuilder.state.json
  → Agent 执行任务
  → session.idle 事件触发
  → 插件检查 Agent 输出是否包含 <promise>DONE</promise>
    → ✅ 找到：循环完成！
    → ❌ 未找到：注入续写提示 → Agent 继续
  → 用户切回 build/plan → ebuilder 状态自动清除 → 循环停止
```

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔁 **`/ralph-loop`** | 标准完成循环（最大 100 次迭代） |
| 🚀 **`/ulw-loop`** | 高强度超频模式（最大 500 次迭代） |
| 🛑 **`/cancel-ralph`** | 取消活跃循环（两种模式通用） |
| 🤖 **ebuilder agent** | 切换到 ebuilder agent 自动持续工作（最大 500 次迭代） |
| 🎯 **完成承诺检测** | 扫描 Agent 输出中的 `<promise>DONE</promise>` |
| 🔔 **Toast 通知** | 实时迭代次数和完成状态更新 |
| 🛡️ **重复保护** | 防止重复处理 idle 事件 |
| ⚙️ **自定义参数** | `--max-iterations=N` 和 `--completion-promise=TEXT` |

---

## 📦 安装

### 方式一：npm（推荐）

在 `opencode.json` 中添加：

```json
{
  "plugin": ["ralph-loop"]
}
```

OpenCode 启动时通过 Bun 自动安装插件。

### 方式二：全局安装（复制到插件目录）

```bash
# 复制插件文件
cp src/index.js ~/.config/opencode/plugins/ralph-loop.js
```

然后在 `opencode.json` 中添加：

```json
{
  "plugin": ["./plugins/ralph-loop.js"],
  "agent": {
    "ebuilder": {
      "mode": "primary",
      "description": "自动持续工作的 Agent。切换到该 Agent 即可无需中断地执行任务。",
      "color": "#FF6600",
      "steps": 200
    }
  }
}
```

### 方式三：项目级安装

```bash
# 复制到项目的 .opencode/plugins/ 目录
mkdir -p .opencode/plugins
cp src/index.js .opencode/plugins/ralph-loop.js
```

---

## 🎮 使用方法

### 🤖 ebuilder Agent（长任务推荐）

1. 在 TUI 中切换到 **ebuilder** agent（Tab 键或 agent 选择器）
2. 正常输入任务
3. Agent 会持续工作，不会中断
4. 切回 **build** 可停止自动续写

### 🔁 Ralph Loop 命令

```bash
# 启动标准循环
/ralph-loop "重构 auth 模块并确保所有测试通过"

# 启动高强度循环
/ulw-loop "将所有 API 客户端迁移到 v2"

# 带自定义参数
/ralph-loop "构建仪表盘" --max-iterations=50 --completion-promise=SHIPPED

# 取消活跃循环
/cancel-ralph
```

### 🏁 Agent 如何标记完成

当 Agent 完全完成任务后，输出：

```xml
<promise>DONE</promise>
```

插件检测到该标签后停止循环。可以通过 `--completion-promise` 自定义承诺文本。

---

## ⚙️ 配置

无需配置文件。循环状态存储在项目目录下的 `.ralph-loop.state.json` 和 `.ebuilder.state.json`，循环完成或取消后自动清理。

---

## 📊 与 oh-my-opencode 对比

| 特性 | oh-my-opencode | opencode-ralph-loop |
|------|---------------|-------------------|
| 📁 文件数量 | ~25 个 TypeScript 文件 | 1 个 JS 文件 |
| 📦 依赖 | 完整 OmO 插件 | 零依赖 |
| 👁️ Oracle 验证 | ✅ | ❌ |
| 🔄 会话重置策略 | ✅ | ❌（仅续写） |
| 🔧 会话恢复 | ✅ | ❌ |
| 🛡️ 竞态保护 | ✅（防抖） | ✅（inFlight Set） |
| 🔁 `/ralph-loop` | ✅ | ✅ |
| 🚀 `/ulw-loop` | ✅ | ✅ |
| 🛑 `/cancel-ralph` | ✅ | ✅ |
| 🤖 ebuilder/Sisyphus agent | ✅（Sisyphus） | ✅（ebuilder） |
| ⏩ 自动续写 | ✅ | ✅ |
| 🔔 Toast 通知 | ✅ | ✅ |
| ⚙️ 自定义最大迭代 | ✅ | ✅ |
| 🎯 自定义完成承诺 | ✅ | ✅ |

---

## 📄 许可证

MIT
