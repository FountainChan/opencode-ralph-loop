import fs from "fs";
import path from "path";
import os from "os";

const STATE_FILE = ".ralph-loop.state.json";
const DEFAULT_MAX_ITERATIONS = 100;
const ULTRAWORK_MAX_ITERATIONS = 500;
const DEFAULT_COMPLETION_PROMISE = "DONE";
const COMPLETION_TAG_PATTERN = /<promise>\s*(.*?)\s*<\/promise>/is;

function getStateFilePath(dir) {
  return path.join(dir, STATE_FILE);
}

function getState(dir) {
  const f = getStateFilePath(dir);
  try {
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch {
    return null;
  }
}

function writeState(dir, state) {
  fs.writeFileSync(getStateFilePath(dir), JSON.stringify(state, null, 2));
}

function clearState(dir) {
  const f = getStateFilePath(dir);
  try {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch {}
}

function buildContinuationPrompt(state) {
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
          description: "(ralph-loop) Cancel active Ralph Loop",
          template: `<command-instruction>
Cancel the active Ralph Loop. Clear the loop state and stop injecting continuations.
Output: Ralph Loop cancelled.
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
        writeState(directory, {
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
        writeState(directory, {
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
        clearState(directory);
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
        const state = getState(directory);
        if (!state || !state.active) return;

        if (state.session_id && state.session_id !== sessionID) return;

        if (
          typeof state.max_iterations === "number" &&
          state.iteration >= state.max_iterations
        ) {
          clearState(directory);
          try {
            await client.tui?.showToast?.({
              body: {
                title: "Ralph Loop Stopped",
                message: `Max iterations (${state.max_iterations}) reached`,
                variant: "warning",
                duration: 5000,
              },
            });
          } catch {}
          return;
        }

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

        if (completionDetected) {
          clearState(directory);
          const isUltrawork = state.ultrawork;
          try {
            await client.tui?.showToast?.({
              body: {
                title: isUltrawork
                  ? "ULTRAWORK LOOP COMPLETE!"
                  : "Ralph Loop Complete!",
                message: `Completed in ${state.iteration} iteration(s). Promise: ${detectedPromise}`,
                variant: "success",
                duration: 5000,
              },
            });
          } catch {}
          return;
        }

        state.iteration += 1;
        state.started_at = new Date().toISOString();
        writeState(directory, state);

        const continuationPrompt = buildContinuationPrompt(state);

        try {
          await client.session.promptAsync({
            path: { id: sessionID },
            body: {
              parts: [{ type: "text", text: continuationPrompt }],
            },
          });

          try {
            await client.tui?.showToast?.({
              body: {
                title: state.ultrawork ? "ULTRAWORK Loop" : "Ralph Loop",
                message: `Iteration ${state.iteration}/${state.max_iterations}`,
                variant: "info",
                duration: 2000,
              },
            });
          } catch {}
        } catch (err) {
          console.error(
            "[ralph-loop] Failed to inject continuation:",
            err.message
          );
          clearState(directory);
        }
      } finally {
        inFlight.delete(sessionID);
      }
    },
  };
}
