"use client";

// Module 2: Ask Copper, the floating shopping chat. Tools on and tools off are
// two separate chats; each question goes to the askCopper Server Action with
// only its own chat's history, and the answer streams in step by step.
// Specs: module-2 spec.md sections 4 and 5.
import { ArrowUpIcon, MessageCircleIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CopperAnswer } from "@/components/copper/ask-copper-answer";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const FAILED = "Sorry, I couldn't reach Copper just now. Please try again.";

type Turn = { id: number; question: string; progress: Progress };
type ChatKey = "on" | "off";

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Record<ChatKey, Turn[]>>({
    on: [],
    off: [],
  });
  const [draft, setDraft] = useState("");
  const nextId = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const key: ChatKey = useTools ? "on" : "off";
  const turns = chats[key];
  const streaming = turns.some((t) => t.progress.status === "working");

  // Open from /#ask, from a later hash change, and from any #ask link. A second
  // click on the header link fires no hashchange, so the click counts too.
  useEffect(() => {
    const fromHash = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const fromClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.('a[href$="#ask"]'))
        setOpen(true);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    document.addEventListener("click", fromClick);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", fromClick);
    };
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [turns]);

  async function ask(question: string) {
    question = question.trim();
    if (!question || streaming) return;
    setDraft("");

    const chat = key;
    const tools = useTools;
    const id = nextId.current++;
    // Only finished replies go back to the model, as plain turns.
    const messages: ChatMessage[] = [
      ...chats[chat].flatMap((t): ChatMessage[] => [
        { role: "user", content: t.question },
        ...(t.progress.status === "done"
          ? [{ role: "assistant" as const, content: t.progress.reply }]
          : []),
      ]),
      { role: "user", content: question },
    ];

    const setProgress = (progress: Progress) =>
      setChats((prev) => ({
        ...prev,
        [chat]: prev[chat].map((t) => (t.id === id ? { ...t, progress } : t)),
      }));

    setChats((prev) => ({
      ...prev,
      [chat]: [
        ...prev[chat],
        { id, question, progress: { steps: [], reply: "", status: "working" } },
      ],
    }));

    try {
      const { progress } = await askCopper({ messages, useTools: tools });
      for await (const update of readLive(progress)) setProgress(update);
    } catch {
      setProgress({ steps: [], reply: FAILED, status: "error" });
    }
  }

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        aria-label="Ask Copper"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-12 gap-2 rounded-full px-5 shadow-lg"
      >
        <MessageCircleIcon className="size-5" />
        Ask Copper
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <header className="bg-chart-5 dark:bg-background text-white">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="bg-primary flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper the robot mascot"
                  width={36}
                  height={36}
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base font-semibold text-white">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-xs text-white/75">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
            {aiConfigured && (
              <div className="flex items-center gap-3 bg-white/10 px-4 py-2">
                <span className="text-sm font-medium">Use tools</span>
                <span className="text-xs text-white/70">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </span>
                <Switch
                  aria-label="Use tools"
                  checked={useTools}
                  onCheckedChange={setUseTools}
                  className="ml-auto"
                />
              </div>
            )}
          </header>

          {!aiConfigured ? (
            <div className="bg-secondary flex-1 overflow-y-auto px-4">
              <SetupRequired service="ai" />
            </div>
          ) : (
            <>
              <div
                ref={bodyRef}
                className="bg-secondary flex-1 space-y-5 overflow-y-auto px-4 py-4"
              >
                {turns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                      {turn.question}
                    </p>
                    <CopperAnswer
                      progress={turn.progress}
                      useTools={useTools}
                    />
                  </div>
                ))}

                {!streaming && (
                  <div className="space-y-2">
                    {turns.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        Ask about prices, totals or stock, or try one of these:
                      </p>
                    )}
                    <div className="flex flex-col items-start gap-1.5">
                      {STARTERS.map((starter) => (
                        <button
                          key={starter}
                          type="button"
                          onClick={() => ask(starter)}
                          className="bg-card hover:border-primary rounded-full border px-3 py-1.5 text-left text-xs transition-colors"
                        >
                          {starter}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask(draft);
                }}
                className="bg-background flex items-center gap-2 border-t p-3"
              >
                <Input
                  aria-label="Your question"
                  placeholder="Ask about prices or stock…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={streaming}
                  className="h-10 rounded-full px-4"
                />
                <Button
                  type="submit"
                  aria-label="Send"
                  size="icon"
                  disabled={streaming}
                  className="size-10 shrink-0 rounded-full"
                >
                  <ArrowUpIcon />
                </Button>
              </form>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
