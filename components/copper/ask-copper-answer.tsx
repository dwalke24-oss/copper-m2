"use client";

// One Ask Copper answer, drawn as stations on a rail in the order they
// happened: the tools Copper could use, its thinking, each tool call (what it
// sent and what came back), then the reply. Specs: module-2 spec.md section 5.
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainIcon,
  ListIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "cn";
import { Streamdown } from "streamdown";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import {
  type Progress,
  type ToolStep,
  TOOL_LABELS,
} from "@/lib/copper/assistant/progress";
// Types only: they vanish at build time, so the stock list never reaches the browser.
import type {
  Availability,
  CalculateCostInput,
  CheckAvailabilityInput,
  CostBreakdown,
  Prices,
  ProductList,
} from "@/lib/copper/assistant/tools";

const productName = (id: string) =>
  getProducts().find((p) => p.id === id)?.name ?? id;
const planName = (id: string) =>
  getPlans().find((p) => p.id === id)?.name ?? id;

export function CopperAnswer({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const working = progress.status === "working";
  const used = new Set(
    progress.steps.flatMap((s) => (s.type === "tool" ? [s.name] : [])),
  );
  let toolNumber = 0;

  return (
    <div className="space-y-3">
      <div className="relative space-y-4 pl-9">
        <div
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-3 w-0.5 -translate-x-1/2 rounded-full",
            useTools
              ? "from-primary via-accent to-accent bg-linear-to-b"
              : "bg-chart-3",
          )}
        />

        <Station
          icon={<ListIcon />}
          node={useTools ? "bg-primary" : "bg-chart-3"}
          label={
            useTools ? "Tools Copper can use" : "Tools given to Copper: none"
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(TOOL_LABELS).map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-xs",
                  !useTools
                    ? "text-muted-foreground bg-background/60 line-through"
                    : used.has(name)
                      ? "bg-accent font-bold text-white"
                      : "text-muted-foreground bg-background/60",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {progress.steps.map((step, i) =>
          step.type === "thinking" ? (
            <Station
              key={i}
              icon={<BrainIcon />}
              node={useTools ? "bg-primary" : "bg-chart-3"}
              label="Copper is thinking"
            >
              <div
                data-testid="thinking"
                className="text-muted-foreground border-l-2 pl-3 text-xs italic"
              >
                <Streamdown>{step.text}</Streamdown>
              </div>
            </Station>
          ) : (
            <Station
              key={step.id}
              icon={<WrenchIcon />}
              node="bg-accent"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={++toolNumber} />
            </Station>
          ),
        )}

        {working && (
          <div className="relative flex min-h-6 items-center">
            <span
              aria-hidden
              className="bg-background absolute -left-9 flex size-6 animate-pulse items-center justify-center gap-0.5 rounded-full"
            >
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="bg-primary size-1 animate-bounce rounded-full"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
            <p className="text-muted-foreground text-xs">
              {nowText(progress, useTools)}
            </p>
          </div>
        )}
      </div>

      {(progress.reply || !working) && (
        <div className="bg-card rounded-2xl rounded-tl-sm border p-3 shadow-xs">
          <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 bg-chart-3/10 mb-2 rounded-md border p-2 text-xs">
              <p className="flex items-center gap-1.5">
                <TriangleAlertIcon className="text-chart-3 size-3.5 shrink-0" />
                <strong>Answered without tools: may be made up</strong>
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <div className="text-sm">
            <Streamdown isAnimating={working}>{progress.reply}</Streamdown>
            {working && (
              <span
                aria-hidden
                className="bg-primary ml-0.5 inline-block h-4 w-0.5 animate-pulse align-text-bottom"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function nowText(progress: Progress, useTools: boolean) {
  if (progress.reply) return "Writing the answer…";
  if (!useTools) return "Answering from memory…";
  if (progress.steps.length > 0) return "Deciding what to do next…";
  return "Reading your question…";
}

function Station({
  icon,
  node,
  label,
  children,
}: {
  icon: React.ReactNode;
  node: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative">
      <span
        aria-hidden
        className={cn(
          "ring-secondary absolute top-0 -left-9 flex size-6 items-center justify-center rounded-full text-white ring-4 [&_svg]:size-3.5",
          node,
        )}
      >
        {icon}
      </span>
      <h3 className="text-muted-foreground mb-1.5 text-[0.65rem] leading-6 font-semibold tracking-widest uppercase">
        {label}
      </h3>
      {children}
    </section>
  );
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-lg border text-xs"
    >
      <div className="bg-accent flex items-center gap-2 px-3 py-1.5 text-white">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="rounded-full bg-white/20 px-1.5 text-[0.65rem]">
          tool {number}
        </span>
        <span className="ml-auto text-white/90">{TOOL_LABELS[step.name]}</span>
      </div>

      <div className="space-y-1.5 px-3 py-2">
        <p className="text-muted-foreground flex items-center gap-1 font-semibold tracking-wider uppercase">
          <ArrowRightIcon className="size-3" />
          What Copper sent
        </p>
        <SentInput step={step} />
      </div>

      <div className="bg-accent/10 space-y-1.5 border-t px-3 py-2">
        <p className="text-muted-foreground flex items-center gap-1 font-semibold tracking-wider uppercase">
          <ArrowLeftIcon className="size-3" />
          What came back
        </p>
        {step.state === "calling" ? (
          <p className="text-muted-foreground flex items-center gap-1.5 italic">
            <Spinner className="size-3" />
            the app is running the code…
          </p>
        ) : step.state === "error" ? (
          <p className="text-chart-3">{String(step.output)}</p>
        ) : (
          <CameBack name={step.name} output={step.output} />
        )}
      </div>
    </div>
  );
}

function SentInput({ step }: { step: ToolStep }) {
  if (step.name === "get_prices")
    return <p>Nothing, it just asked for the price list</p>;
  if (step.name === "get_products")
    return <p>Nothing, it just asked what Copper sells</p>;
  if (step.input === undefined)
    return (
      <p className="text-muted-foreground italic">filling in the details…</p>
    );

  let rows: [string, string][] = [];
  if (step.name === "calculate_cost") {
    const input = step.input as CalculateCostInput;
    rows = [
      ["Products", input.products.map(productName).join(", ") || "None"],
      ["Plan", planName(input.plan)],
      ["Billing", input.billing],
      ["Years", String(input.years)],
    ];
  } else if (step.name === "check_availability") {
    const input = step.input as CheckAvailabilityInput;
    rows = [
      ["Product", productName(input.product)],
      ["Color", input.color ?? "Every color"],
    ];
  }
  return <Rows rows={rows} />;
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CameBack({ name, output }: { name: string; output: unknown }) {
  if (name === "calculate_cost") {
    const cost = output as CostBreakdown;
    return (
      <div>
        {cost.lines.map((line, i) => (
          <div key={i} className="flex justify-between gap-4">
            <span>{line.item}</span>
            <span className="tabular-nums">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="mt-1.5 flex items-baseline justify-between border-t pt-1.5">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-lg font-bold tabular-nums">
            {formatUsd(cost.totalUsd)}
          </span>
        </div>
      </div>
    );
  }

  if (name === "get_products") {
    const { products } = output as ProductList;
    return (
      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id}>
            <p className="flex justify-between font-semibold">
              <span>{p.name}</span>
              <span>{formatUsd(p.priceUsd)}</span>
            </p>
            <p className="text-muted-foreground">{p.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.colors.map((c) => (
                <span key={c} className="bg-accent/15 rounded-full px-1.5">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (name === "get_prices") {
    const prices = output as Prices;
    return (
      <Rows
        rows={[
          ...prices.products.map((p): [string, string] => [
            p.name,
            formatUsd(p.priceUsd),
          ]),
          ...prices.plans
            .filter((p) => p.monthlyUsd > 0 || p.annualUsd > 0)
            .map((p): [string, string] => [
              p.name,
              `${formatUsd(p.monthlyUsd)}/mo · ${formatUsd(p.annualUsd)}/yr`,
            ]),
        ]}
      />
    );
  }

  if (name === "check_availability") {
    const result = output as Availability;
    if (result.status === "unavailable") return <p>{result.message}</p>;
    if (result.status === "not_a_color")
      return (
        <p>
          {result.product} doesn&apos;t come in {result.color}. It comes in{" "}
          {listOf(result.colors)}.
        </p>
      );
    return (
      <Rows
        rows={result.colors.map(({ color, stock, restockDate }) => [
          color,
          <span
            key={color}
            className={cn(
              "rounded-full px-1.5",
              stock === "in_stock" && "bg-accent text-white",
              stock === "low_stock" && "bg-chart-4 text-foreground",
              stock === "backordered" && "bg-chart-3 text-white",
            )}
          >
            {stock === "in_stock"
              ? "In stock"
              : stock === "low_stock"
                ? "Low stock"
                : `Back-ordered until ${restockOn(restockDate!)}`}
          </span>,
        ])}
      />
    );
  }

  return (
    <pre className="whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>
  );
}

/** "A, B and C". */
function listOf(items: string[]) {
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
    : (items[0] ?? "");
}

/** "2026-11-14" → "Nov 14, 2026". */
function restockOn(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
