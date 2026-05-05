import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH = path.resolve(__dirname, "..", "ralph-loop.js");
const SANDBOX_DIR = path.join(__dirname, "sandbox");

const DEFAULT_MAX_ITERATIONS = 100;
const ULTRAWORK_MAX_ITERATIONS = 500;
const DEFAULT_COMPLETION_PROMISE = "DONE";
const COMPLETION_TAG_PATTERN = /<promise>\s*(.*?)\s*<\/promise>/is;

const passed = [];
const failed = [];
let testNum = 0;

function assert(condition, label) {
  testNum++;
  if (condition) {
    passed.push(`  ✅ #${testNum} ${label}`);
  } else {
    failed.push(`  ❌ #${testNum} ${label}`);
  }
}

function cleanup() {
  if (fs.existsSync(SANDBOX_DIR)) {
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

// ─── 模拟 OpenCode 插件上下文 ───

let stateFileContent = null;
let promptAsyncCalls = [];
let toastCalls = [];

function createMockContext() {
  stateFileContent = null;
  promptAsyncCalls = [];
  toastCalls = [];

  return {
    client: {
      session: {
        messages: async () => ({ data: [] }),
        promptAsync: async (opts) => {
          promptAsyncCalls.push(opts);
        },
      },
      tui: {
        showToast: async (opts) => {
          toastCalls.push(opts);
        },
      },
    },
    directory: SANDBOX_DIR,
  };
}

// 模拟插件的文件系统操作（通过 monkey-patch）
function mockFS() {
  const origGetState = (dir) => {
    const f = path.join(dir, ".ralph-loop.state.json");
    try {
      if (!fs.existsSync(f)) return null;
      return JSON.parse(fs.readFileSync(f, "utf-8"));
    } catch { return null; }
  };

  const origWriteState = (dir, state) => {
    fs.writeFileSync(
      path.join(dir, ".ralph-loop.state.json"),
      JSON.stringify(state, null, 2)
    );
  };

  const origClearState = (dir) => {
    const f = path.join(dir, ".ralph-loop.state.json");
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  };

  return { getState: origGetState, writeState: origWriteState, clearState: origClearState };
}

async function loadPlugin(ctx) {
  const module = await import(`file:///${PLUGIN_PATH.replace(/\\/g, "/")}?t=${Date.now()}`);
  return module.default(ctx);
}

// ─── 测试用例 ───

async function testPluginLoads() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);
  assert(typeof plugin === "object", "plugin 导出对象");
  assert(typeof plugin.config === "function", "config 钩子存在");
  assert(typeof plugin["chat.message"] === "function", "chat.message 钩子存在");
  assert(typeof plugin.event === "function", "event 钩子存在");
}

async function testCommandRegistration() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);
  const inputConfig = { command: {} };
  await plugin.config(inputConfig);
  assert("ralph-loop" in inputConfig.command, "注册 /ralph-loop 命令");
  assert("ulw-loop" in inputConfig.command, "注册 /ulw-loop 命令");
  assert("cancel-ralph" in inputConfig.command, "注册 /cancel-ralph 命令");
  assert(
    inputConfig.command["ralph-loop"].template.includes("<promise>"),
    "ralph-loop 模板包含 promise 指令"
  );
  assert(
    inputConfig.command["ulw-loop"].template.includes("ultrawork") ||
      inputConfig.command["ulw-loop"].template.includes("MAXIMUM"),
    "ulw-loop 模板包含高强度指令"
  );
}

async function testChatMessageRalphLoop() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);
  const fs_ = mockFS();

  await plugin["chat.message"](
    { sessionID: "test-session-1", parts: [{ type: "text", text: '/ralph-loop "build auth system"' }] },
    {}
  );

  const state = fs_.getState(SANDBOX_DIR);
  assert(state !== null, "/ralph-loop 创建状态文件");
  assert(state.active === true, "状态为 active");
  assert(state.ultrawork === false, "非 ultrawork 模式");
  assert(state.prompt === "build auth system", "prompt 正确解析");
  assert(state.max_iterations === DEFAULT_MAX_ITERATIONS, `默认最大迭代 ${DEFAULT_MAX_ITERATIONS}`);
  assert(state.session_id === "test-session-1", "session_id 正确");
  assert(state.completion_promise === DEFAULT_COMPLETION_PROMISE, "默认 completion promise");
}

async function testChatMessageUlwLoop() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);
  const fs_ = mockFS();

  await plugin["chat.message"](
    { sessionID: "test-session-2", parts: [{ type: "text", text: '/ulw-loop "migrate all APIs"' }] },
    {}
  );

  const state = fs_.getState(SANDBOX_DIR);
  assert(state !== null, "/ulw-loop 创建状态文件");
  assert(state.ultrawork === true, "ultrawork 模式");
  assert(state.max_iterations === ULTRAWORK_MAX_ITERATIONS, `ultrawork 最大迭代 ${ULTRAWORK_MAX_ITERATIONS}`);
}

async function testChatMessageCustomParams() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);
  const fs_ = mockFS();

  await plugin["chat.message"](
    {
      sessionID: "test-session-3",
      parts: [{ type: "text", text: '/ralph-loop "do stuff" --max-iterations=25 --completion-promise=SHIPPED' }],
    },
    {}
  );

  const state = fs_.getState(SANDBOX_DIR);
  assert(state !== null, "自定义参数创建状态");
  assert(state.max_iterations === 25, "自定义 max-iterations=25");
  assert(state.completion_promise === "SHIPPED", "自定义 completion-promise=SHIPPED");
}

async function testCancelRalph() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);
  const fs_ = mockFS();

  fs_.writeState(SANDBOX_DIR, { active: true, iteration: 1 });
  assert(fs_.getState(SANDBOX_DIR) !== null, "状态文件已创建");

  await plugin["chat.message"](
    { sessionID: "test-session", parts: [{ type: "text", text: "/cancel-ralph" }] },
    {}
  );

  assert(fs_.getState(SANDBOX_DIR) === null, "/cancel-ralph 清除状态");
}

async function testEventIgnoresNonIdle() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);

  await plugin.event({ event: { type: "session.created" } });
  assert(promptAsyncCalls.length === 0, "非 idle 事件被忽略");
}

async function testEventIgnoresNoState() {
  cleanup();
  const ctx = createMockContext();
  const plugin = await loadPlugin(ctx);

  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s1" } } });
  assert(promptAsyncCalls.length === 0, "无状态文件时 idle 不触发续接");
}

async function testEventCompletionDetected() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => ({
    data: [
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "Task done! <promise>DONE</promise>" }],
      },
    ],
  });

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 3,
    max_iterations: 100,
    completion_promise: "DONE",
    ultrawork: false,
    started_at: new Date().toISOString(),
    prompt: "test task",
    session_id: "s-complete",
  });

  const plugin = await loadPlugin(ctx);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-complete" } } });

  assert(fs_.getState(SANDBOX_DIR) === null, "完成后状态被清除");
  assert(promptAsyncCalls.length === 0, "完成后不注入续接");
  assert(toastCalls.length === 1, "显示完成 toast");
  assert(toastCalls[0]?.body?.title === "Ralph Loop Complete!", "toast 标题正确");
}

async function testEventCompletionUltrawork() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => ({
    data: [
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "<promise>DONE</promise>" }],
      },
    ],
  });

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 5,
    max_iterations: 500,
    completion_promise: "DONE",
    ultrawork: true,
    started_at: new Date().toISOString(),
    prompt: "test task",
    session_id: "s-ulw",
  });

  const plugin = await loadPlugin(ctx);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-ulw" } } });

  assert(toastCalls[0]?.body?.title === "ULTRAWORK LOOP COMPLETE!", "ultrawork toast 标题正确");
}

async function testEventContinuationInjected() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => ({ data: [] });

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 1,
    max_iterations: 100,
    completion_promise: "DONE",
    ultrawork: false,
    started_at: new Date().toISOString(),
    prompt: "build the feature",
    session_id: "s-cont",
  });

  const plugin = await loadPlugin(ctx);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-cont" } } });

  assert(promptAsyncCalls.length === 1, "注入了一次续接 prompt");
  assert(promptAsyncCalls[0].path.id === "s-cont", "续接注入到正确会话");
  assert(
    promptAsyncCalls[0].body.parts[0].text.includes("RALPH LOOP 2/100"),
    "续接 prompt 包含迭代信息"
  );
  assert(
    promptAsyncCalls[0].body.parts[0].text.includes("build the feature"),
    "续接 prompt 包含原始任务"
  );

  const newState = fs_.getState(SANDBOX_DIR);
  assert(newState.iteration === 2, "迭代数增加到 2");
}

async function testEventUltraworkContinuation() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => ({ data: [] });

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 1,
    max_iterations: 500,
    completion_promise: "DONE",
    ultrawork: true,
    started_at: new Date().toISOString(),
    prompt: "do the thing",
    session_id: "s-ulw-cont",
  });

  const plugin = await loadPlugin(ctx);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-ulw-cont" } } });

  assert(
    promptAsyncCalls[0].body.parts[0].text.startsWith("ultrawork "),
    "ultrawork 续接 prompt 以 'ultrawork ' 开头"
  );
}

async function testMaxIterationsReached() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => ({ data: [] });

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 100,
    max_iterations: 100,
    completion_promise: "DONE",
    ultrawork: false,
    started_at: new Date().toISOString(),
    prompt: "stuck task",
    session_id: "s-max",
  });

  const plugin = await loadPlugin(ctx);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-max" } } });

  assert(fs_.getState(SANDBOX_DIR) === null, "达到最大迭代后清除状态");
  assert(promptAsyncCalls.length === 0, "达到最大迭代后不注入续接");
  assert(
    toastCalls.some(t => t.body?.title === "Ralph Loop Stopped"),
    "显示停止 toast"
  );
}

async function testInFlightProtection() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => {
    await new Promise(r => setTimeout(r, 100));
    return { data: [] };
  };

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 1,
    max_iterations: 100,
    completion_promise: "DONE",
    ultrawork: false,
    started_at: new Date().toISOString(),
    prompt: "test",
    session_id: "s-flight",
  });

  const plugin = await loadPlugin(ctx);

  const p1 = plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-flight" } } });
  const p2 = plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-flight" } } });

  await Promise.all([p1, p2]);

  assert(promptAsyncCalls.length === 1, "in-flight 保护：仅处理一次 idle 事件");
}

async function testSessionIdMismatch() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => ({ data: [] });

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 1,
    max_iterations: 100,
    completion_promise: "DONE",
    ultrawork: false,
    started_at: new Date().toISOString(),
    prompt: "test",
    session_id: "s-original",
  });

  const plugin = await loadPlugin(ctx);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-different" } } });

  assert(promptAsyncCalls.length === 0, "session_id 不匹配时不触发续接");
}

async function testCustomPromiseDetection() {
  cleanup();
  const ctx = createMockContext();
  const fs_ = mockFS();

  ctx.client.session.messages = async () => ({
    data: [
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "All done! <promise>SHIPPED</promise>" }],
      },
    ],
  });

  fs_.writeState(SANDBOX_DIR, {
    active: true,
    iteration: 2,
    max_iterations: 50,
    completion_promise: "SHIPPED",
    ultrawork: false,
    started_at: new Date().toISOString(),
    prompt: "test",
    session_id: "s-custom",
  });

  const plugin = await loadPlugin(ctx);
  await plugin.event({ event: { type: "session.idle", properties: { sessionID: "s-custom" } } });

  assert(fs_.getState(SANDBOX_DIR) === null, "自定义 promise 检测成功");
  assert(promptAsyncCalls.length === 0, "自定义 promise 不注入续接");
}

// ─── 运行测试 ───

const tests = [
  ["插件加载", testPluginLoads],
  ["命令注册", testCommandRegistration],
  ["/ralph-loop 命令解析", testChatMessageRalphLoop],
  ["/ulw-loop 命令解析", testChatMessageUlwLoop],
  ["自定义参数解析", testChatMessageCustomParams],
  ["/cancel-ralph 取消", testCancelRalph],
  ["忽略非 idle 事件", testEventIgnoresNonIdle],
  ["无状态时忽略 idle", testEventIgnoresNoState],
  ["完成检测（普通模式）", testEventCompletionDetected],
  ["完成检测（ultrawork 模式）", testEventCompletionUltrawork],
  ["续接 prompt 注入", testEventContinuationInjected],
  ["ultrawork 续接前缀", testEventUltraworkContinuation],
  ["最大迭代限制", testMaxIterationsReached],
  ["in-flight 保护", testInFlightProtection],
  ["session_id 不匹配", testSessionIdMismatch],
  ["自定义 promise 检测", testCustomPromiseDetection],
];

console.log("\n🧪 opencode-ralph-loop 测试套件\n");
console.log(`共 ${tests.length} 组测试\n`);

for (const [name, fn] of tests) {
  try {
    await fn();
  } catch (err) {
    failed.push(`  ❌ [${name}] 异常: ${err.message}`);
  }
}

cleanup();

console.log("─".repeat(50));
console.log(`\n通过: ${passed.length}  失败: ${failed.length}\n`);

if (passed.length) {
  console.log("通过:");
  passed.forEach(s => console.log(s));
}

if (failed.length) {
  console.log("\n失败:");
  failed.forEach(s => console.log(s));
  process.exit(1);
}

console.log("\n✨ 全部通过!\n");
