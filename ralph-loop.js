import fs from "fs";
import path from "path";
import os from "os";

const RALPH_STATE_FILE = ".ralph-loop.state.json";
const EBUILDER_STATE_FILE = ".ebuilder.state.json";
const DEFAULT_MAX_ITERATIONS = 100;
const ULTRAWORK_MAX_ITERATIONS = 500;
const EBUILDER_MAX_ITERATIONS = 500;
const DEFAULT_COMPLETION_PROMISE = "DONE";
const COMPLETION_TAG_PATTERN = /<promise>\s*(.*?)\s*<\/promise>/is;

function getStateFilePath(dir, file) {
  return path.join(dir, file);
}

function getState(dir, file) {
  try {
    const f = getStateFilePath(dir, file);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch {
    return null;
  }
}

function writeState(dir, file, state) {
  fs.writeFileSync(getStateFilePath(dir, file), JSON.stringify(state, null, 2));
}

function clearState(dir, file) {
  try {
    const f = getStateFilePath(dir, file);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch {}
}

function buildRalphContinuationPrompt(state) {
  const prefix = state.ultrawork ? "ultrawork " : "";
  const maxLabel =
    typeof state.max_iterations === "number"
      ? String(state.max_iterations)
      : "unbounded";
  return `${prefix}[SYSTEM DIRECTIVE: RALPH LOOP ${state.iteration}/${maxLabel}]

Your previous attempt did not output the completion promise. Continue working on the task.

IMPORTANT:
- Review your progress so far
- Continue from where you left off
- When FULLY complete, output: <promise>${state.completion_promise}</promise>
- Do not stop until the task is truly done

Original task:
${state.prompt}`;
}

function buildEbuilderContinuationPrompt(state) {
  return `[SYSTEM DIRECTIVE: EBUILDER LOOP ${state.iteration}/${state.max_iterations}]

Continue your work. Do not stop until the task is complete.

IMPORTANT:
- Review your progress so far
- Continue from where you left off
- When FULLY complete, output: <promise>${state.completion_promise}</promise>
- Do not stop until the task is truly done
- If you encounter errors, fix them yourself and continue`;
}

function parseLoopCommand(text, commandName) {
  const regex = new RegExp(
    `\/${commandName}\\s+(?:"([\\s\\S]*?)"|'([\\s\\S]*?)'|(.*))`,
    "i"
  );
  const match = text.match(regex);
  if (!match) return null;
  const prompt =
    match[1] || match[2] || match[3]?.trim() || "Complete the task as instructed";

  let maxIterations;
  let completionPromise;

  const maxIterMatch = text.match(/--max-iterations=(\d+)/i);
  if (maxIterMatch) maxIterations = parseInt(maxIterMatch[1], 10);

  const promiseMatch = text.match(/--completion-promise=["']?([^"'\s]+)["']?/i);
  if (promiseMatch) completionPromise = promiseMatch[1];

  return { prompt, maxIterations, completionPromise };
}

async function checkCompletion(client, sessionID) {
  let completionDetected = false;
  let detectedPromise = null;

  try {
    const response = await client.session.messages({
      path: { id: sessionID },
    });
    const messages = response.data || response;
    const assistantMessages = (Array.isArray(messages) ? messages : []).filter(
      (m) => m.info?.role === "assistant"
    );

    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const parts = assistantMessages[i].parts || [];
      for (const part of parts) {
        if (part.type === "text" && part.text) {
          const match = part.text.match(COMPLETION_TAG_PATTERN);
          if (match) {
            completionDetected = true;
            detectedPromise = match[1].trim();
            break;
          }
        }
      }
      if (completionDetected) break;
    }
  } catch (err) {
    console.error("[ralph-loop] Failed to check messages:", err.message);
  }

  return { completionDetected, detectedPromise };
}

async function showToast(client, title, message, variant, duration) {
  try {
    await client.tui?.showToast?.({
      body: { title, message, variant, duration: duration || 5000 },
    });
  } catch {}
}

export default async function ralphLoopPlugin({ client, directory }) {
  const inFlight = new Set();

  return {
    config: async (inputConfig) => {
      const existing = inputConfig.command || {};
      inputConfig.command = {
        ...existing,
        "ralph-loop": {
          description:
            "(ralph-loop) Start self-referential development loop until completion",
          template: `<command-instruction>
You are now in RALPH LOOP mode. Work on the task until it is FULLY complete.

RULES:
- Work continuously until every part of the task is done
- When FULLY complete, output: <promise>DONE</promise>
- Do NOT output the promise until everything is verified
- Do NOT stop early or take shortcuts
- Output the promise ONLY ONCE when truly done
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
          argumentHint: '"task description" [--completion-promise=TEXT] [--max-iterations=N]',
        },
        "ulw-loop": {
          description:
            "(ralph-loop) Start ultrawork loop - maximum intensity until completion",
          template: `<command-instruction>
You are now in ULTRAWORK LOOP mode. Work at MAXIMUM intensity until the task is FULLY complete.

RULES:
- Work continuously at maximum effort
- Use parallel agents aggressively for exploration
- Deep-analyze before implementing
- When FULLY complete, output: <promise>DONE</promise>
- Do NOT output the promise until everything is verified
- Do NOT stop early or take shortcuts
- Output the promise ONLY ONCE when truly done
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
          argumentHint: '"task description" [--completion-promise=TEXT] [--max-iterations=N]',
        },
        "cancel-ralph": {
          description: "(ralph-loop) Cancel active Ralph Loop or ebuilder Loop",
          template: `<command-instruction>
Cancel the active Ralph Loop or ebuilder Loop. Clear the loop state and stop injecting continuations.
Output: Loop cancelled.
</command-instruction>`,
        },
      };
    },

    "chat.message": async (input, output) => {
      const text = (input.parts || [])
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");

      const ralphResult = parseLoopCommand(text, "ralph-loop");
      if (ralphResult) {
        writeState(directory, RALPH_STATE_FILE, {
          active: true,
          iteration: 1,
          max_iterations:
            ralphResult.maxIterations ?? DEFAULT_MAX_ITERATIONS,
          completion_promise:
            ralphResult.completionPromise ?? DEFAULT_COMPLETION_PROMISE,
          ultrawork: false,
          started_at: new Date().toISOString(),
          prompt: ralphResult.prompt,
          session_id: input.sessionID,
        });
        return;
      }

      const ulwResult = parseLoopCommand(text, "ulw-loop");
      if (ulwResult) {
        writeState(directory, RALPH_STATE_FILE, {
          active: true,
          iteration: 1,
          max_iterations:
            ulwResult.maxIterations ?? ULTRAWORK_MAX_ITERATIONS,
          completion_promise:
            ulwResult.completionPromise ?? DEFAULT_COMPLETION_PROMISE,
          ultrawork: true,
          started_at: new Date().toISOString(),
          prompt: ulwResult.prompt,
          session_id: input.sessionID,
        });
        return;
      }

      if (/\/cancel-ralph/i.test(text)) {
        clearState(directory, RALPH_STATE_FILE);
        clearState(directory, EBUILDER_STATE_FILE);
      }

      if (input.agent === "ebuilder") {
        const existing = getState(directory, EBUILDER_STATE_FILE);
        if (!existing || !existing.active) {
          writeState(directory, EBUILDER_STATE_FILE, {
            active: true,
            iteration: 1,
            max_iterations: EBUILDER_MAX_ITERATIONS,
            completion_promise: DEFAULT_COMPLETION_PROMISE,
            started_at: new Date().toISOString(),
            session_id: input.sessionID,
          });
          await showToast(client, "ebuilder Active", "Auto-continuation enabled", "info", 3000);
        }
      } else {
        clearState(directory, EBUILDER_STATE_FILE);
      }
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") return;

      const props = event.properties || {};
      const sessionID = props.sessionID;
      if (!sessionID) return;

      if (inFlight.has(sessionID)) return;
      inFlight.add(sessionID);

      try {
        const ralphState = getState(directory, RALPH_STATE_FILE);
        if (ralphState && ralphState.active) {
          await handleContinuation(client, directory, sessionID, ralphState, RALPH_STATE_FILE, false);
          return;
        }

        const ebuilderState = getState(directory, EBUILDER_STATE_FILE);
        if (ebuilderState && ebuilderState.active) {
          await handleContinuation(client, directory, sessionID, ebuilderState, EBUILDER_STATE_FILE, true);
          return;
        }
      } finally {
        inFlight.delete(sessionID);
      }
    },
  };
}

async function handleContinuation(client, directory, sessionID, state, stateFile, isEbuilder) {
  if (state.session_id && state.session_id !== sessionID) return;

  if (
    typeof state.max_iterations === "number" &&
    state.iteration >= state.max_iterations
  ) {
    clearState(directory, stateFile);
    await showToast(
      client,
      isEbuilder ? "ebuilder Stopped" : "Ralph Loop Stopped",
      `Max iterations (${state.max_iterations}) reached`,
      "warning"
    );
    return;
  }

  const { completionDetected, detectedPromise } = await checkCompletion(client, sessionID);

  if (completionDetected) {
    clearState(directory, stateFile);
    const label = isEbuilder
      ? "ebuilder Complete!"
      : state.ultrawork
        ? "ULTRAWORK LOOP COMPLETE!"
        : "Ralph Loop Complete!";
    await showToast(
      client,
      label,
      `Completed in ${state.iteration} iteration(s). Promise: ${detectedPromise}`,
      "success"
    );
    return;
  }

  state.iteration += 1;
  state.started_at = new Date().toISOString();
  writeState(directory, stateFile, state);

  const continuationPrompt = isEbuilder
    ? buildEbuilderContinuationPrompt(state)
    : buildRalphContinuationPrompt(state);

  try {
    await client.session.promptAsync({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: continuationPrompt }],
      },
    });

    const loopLabel = isEbuilder
      ? "ebuilder Loop"
      : state.ultrawork
        ? "ULTRAWORK Loop"
        : "Ralph Loop";
    await showToast(
      client,
      loopLabel,
      `Iteration ${state.iteration}/${state.max_iterations}`,
      "info",
      2000
    );
  } catch (err) {
    console.error("[ralph-loop] Failed to inject continuation:", err.message);
    clearState(directory, stateFile);
  }
}
