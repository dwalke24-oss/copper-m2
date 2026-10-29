"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, Step, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const NO_REPLY = "Sorry, I couldn't come up with an answer. Please try again.";
const FAILED = "Sorry, something went wrong on my end. Please try again.";

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  // Hand the live value back straight away; the stream is read in the background.
  void stream(request, update, done);
  return { progress: live };
}

async function stream(
  { messages, useTools }: AskCopperRequest,
  update: (progress: Progress) => void,
  done: (progress: Progress) => void,
) {
  const steps: Step[] = [];
  let reply = "";

  // A fresh copy every time, so updates already handed out never change.
  const snapshot = (status: Progress["status"]): Progress => ({
    steps: steps.map((step) => ({ ...step })),
    reply,
    status,
  });

  // tool-input-start gives the id as part.id; tool-call, tool-result and
  // tool-error give the same id as part.toolCallId.
  const toolStep = (id: string, name: string): ToolStep => {
    let step = steps.find(
      (s): s is ToolStep => s.type === "tool" && s.id === id,
    );
    if (!step) {
      step = { type: "tool", id, name, state: "calling" };
      steps.push(step);
    }
    return step;
  };

  try {
    const result = callStream(
      { module: 2, feature: "ask-copper" },
      useTools
        ? {
            instructions: COPPER_INSTRUCTIONS,
            messages,
            tools: copperTools,
            stopWhen: stepCountIs(MAX_STEPS),
            providerOptions: THOUGHT_SUMMARIES,
          }
        : // Tools off: just the conversation, with nothing telling it to check.
          { messages, providerOptions: THOUGHT_SUMMARIES },
    );

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "reasoning-delta": {
          const last = steps.at(-1);
          if (last?.type === "thinking") last.text += part.text;
          else steps.push({ type: "thinking", text: part.text });
          break;
        }
        case "tool-input-start":
          toolStep(part.id, part.toolName);
          break;
        case "tool-call":
          toolStep(part.toolCallId, part.toolName).input = part.input;
          break;
        case "tool-result": {
          const step = toolStep(part.toolCallId, part.toolName);
          step.output = part.output;
          step.state = "done";
          break;
        }
        case "tool-error": {
          const step = toolStep(part.toolCallId, part.toolName);
          step.output =
            part.error instanceof Error
              ? part.error.message
              : String(part.error);
          step.state = "error";
          break;
        }
        case "text-delta":
          reply += part.text;
          break;
        case "error":
          throw part.error;
        default:
          continue;
      }
      update(snapshot("working"));
    }

    if (!reply.trim()) reply = NO_REPLY;
    done(snapshot("done"));
  } catch {
    if (!reply.trim()) reply = FAILED;
    done(snapshot("error"));
  }
}
