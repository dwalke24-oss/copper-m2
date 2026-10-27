// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: { id: Plan["id"]; name: string; monthlyUsd: number; annualUsd: number }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const productIds = ["copper-home", "copper-notes"] as const;

/** Rounds to whole cents, so 7.99 × 12 is 95.88 and not 95.88000000000001. */
const toCents = (usd: number) => Math.round(usd * 100) / 100;

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z.array(z.enum(productIds)).max(5),
  plan: z.enum(["free", "copper-plus"]),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const lines: CostBreakdown["lines"] = input.products.map((id) => {
    const product = products.find((p) => p.id === id)!;
    return { item: product.name, usd: toCents(product.priceUsd) };
  });

  // The free plan costs nothing, so it adds no line. A paid plan covers the
  // whole household, so it's counted once however many devices there are.
  const plan = getPlans().find((p) => p.id === input.plan)!;
  if (plan.monthlyUsd > 0 || plan.annualUsd > 0) {
    const years = `${input.years} ${input.years === 1 ? "year" : "years"}`;
    lines.push(
      input.billing === "monthly"
        ? {
            item: `${plan.name}, paid monthly for ${years}`,
            usd: toCents(plan.monthlyUsd * 12 * input.years),
          }
        : {
            item: `${plan.name}, paid yearly for ${years}`,
            usd: toCents(plan.annualUsd * input.years),
          },
    );
  }

  const totalUsd = toCents(lines.reduce((sum, line) => sum + line.usd, 0));
  return { lines, totalUsd };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: z.enum(productIds),
    color: z.string().optional(),
  });

function stockLevel(units: number): Stock {
  if (units === 0) return "backordered";
  if (units < 10) return "low_stock";
  return "in_stock";
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product)!;

  // Check the color against the catalog before reading stock: a color the
  // product doesn't come in is never "out of stock".
  let colors = product.colors;
  if (input.color !== undefined) {
    const asked = input.color.trim().toLowerCase();
    const match = product.colors.find((c) => c.toLowerCase() === asked);
    if (!match) {
      return {
        status: "not_a_color",
        product: product.name,
        color: input.color,
        colors: product.colors,
      };
    }
    colors = [match];
  }

  const inventory = await readInventory();
  if (inventory === null) {
    return {
      status: "unavailable",
      message:
        "Stock can't be checked right now. Please try again in a little while.",
    };
  }

  // Stock rows name the product by its display name, not its id.
  const rows = inventory.filter((row) => row.product === product.name);
  return {
    status: "ok",
    product: product.name,
    colors: colors.flatMap((color) => {
      const row = rows.find(
        (r) => r.color.toLowerCase() === color.toLowerCase(),
      );
      if (!row) return [];
      const stock = stockLevel(row.units_in_stock);
      return [
        {
          color,
          stock,
          restockDate: stock === "backordered" ? row.next_shipment : null,
        },
      ];
    }),
  };
}

/** The tools the model can call. Each description tells it when to use one. */
export const copperTools = {
  get_products: tool({
    description:
      "Lists every Copper product with its type, price and the colors it comes in (not whether they're in stock).",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Gives the price of every Copper device and the monthly and yearly price of every plan.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Works out the total cost of Copper devices plus a plan, billed monthly or yearly, over 1 to 5 years.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Checks today's stock of a Copper product, for every color or just one, with the restock date for back-ordered colors.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
} satisfies ToolSet;
