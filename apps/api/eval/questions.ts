/**
 * Plain-language questions about the four sample datasets, each with the SQL that answers it. A model is right if its
 * query returns the same answer as any of the gold queries (see compare.ts), however it writes the SQL.
 * Where a question can be answered in more than one form (a month as a date, a number or a name), each form is listed.
 */
export interface Question {
  dataset: "ecommerce-orders" | "household-spending" | "marketing-performance" | "support-tickets";
  id: string;
  ask: string;
  gold: string[];
  /** The answer may be a fraction or a percentage. */
  scales?: number[];
}

const ECOM_MONTHS = [
  "SELECT date_trunc('month', order_date) AS m, sum(revenue) AS v FROM data GROUP BY 1 ORDER BY 1",
  "SELECT month(order_date) AS m, sum(revenue) AS v FROM data GROUP BY 1 ORDER BY 1",
  "SELECT strftime(order_date, '%Y-%m') AS m, sum(revenue) AS v FROM data GROUP BY 1 ORDER BY 1",
  "SELECT monthname(order_date) AS m, sum(revenue) AS v FROM data GROUP BY 1 ORDER BY min(order_date)",
];

export const QUESTIONS: Question[] = [
  // ---- online store orders ----
  { dataset: "ecommerce-orders", id: "e1", ask: "What is the total revenue?", gold: ["SELECT sum(revenue) FROM data"] },
  { dataset: "ecommerce-orders", id: "e2", ask: "Which region brings in the most revenue?", gold: ["SELECT region FROM data GROUP BY 1 ORDER BY sum(revenue) DESC LIMIT 1"] },
  { dataset: "ecommerce-orders", id: "e3", ask: "How many orders came through the App channel?", gold: ["SELECT count(*) FROM data WHERE channel = 'App'"] },
  { dataset: "ecommerce-orders", id: "e4", ask: "What is the average discount percentage on Electronics orders?", gold: ["SELECT avg(discount_pct) FROM data WHERE category = 'Electronics'"] },
  { dataset: "ecommerce-orders", id: "e5", ask: "Show revenue by month.", gold: ECOM_MONTHS },
  { dataset: "ecommerce-orders", id: "e6", ask: "Which category has the highest average quantity per order?", gold: ["SELECT category FROM data GROUP BY 1 ORDER BY avg(quantity) DESC LIMIT 1"] },
  { dataset: "ecommerce-orders", id: "e7", ask: "What share of revenue comes from the Web channel?", gold: ["SELECT sum(revenue) FILTER (WHERE channel = 'Web') / sum(revenue) FROM data"], scales: [1, 100] },
  { dataset: "ecommerce-orders", id: "e8", ask: "How many different regions are there?", gold: ["SELECT count(DISTINCT region) FROM data"] },
  { dataset: "ecommerce-orders", id: "e9", ask: "Which day had the highest revenue?", gold: ["SELECT order_date FROM data GROUP BY 1 ORDER BY sum(revenue) DESC LIMIT 1"] },
  { dataset: "ecommerce-orders", id: "e10", ask: "Which region has the highest average order value, and what is it?", gold: ["SELECT region, sum(revenue) / count(*) FROM data GROUP BY 1 ORDER BY 2 DESC LIMIT 1"] },
  { dataset: "ecommerce-orders", id: "e11", ask: "What percentage of orders had a discount?", gold: ["SELECT count(*) FILTER (WHERE discount_pct > 0) * 1.0 / count(*) FROM data"], scales: [1, 100] },
  { dataset: "ecommerce-orders", id: "e12", ask: "What share of total revenue does each of the top 3 categories have?", gold: ["SELECT category, sum(revenue) / (SELECT sum(revenue) FROM data) FROM data GROUP BY 1 ORDER BY 2 DESC LIMIT 3"], scales: [1, 100] },

  // ---- household spending ----
  { dataset: "household-spending", id: "h1", ask: "How much was spent in total?", gold: ["SELECT sum(amount) FROM data"] },
  { dataset: "household-spending", id: "h2", ask: "Which category has the highest spending?", gold: ["SELECT category FROM data GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 1"] },
  { dataset: "household-spending", id: "h3", ask: "How much was spent on essentials?", gold: ["SELECT sum(amount) FROM data WHERE essential = 'Yes'"] },
  { dataset: "household-spending", id: "h4", ask: "What is the average transaction amount?", gold: ["SELECT avg(amount) FROM data"] },
  { dataset: "household-spending", id: "h5", ask: "How much was spent on each account?", gold: ["SELECT account, sum(amount) FROM data GROUP BY 1"] },
  {
    dataset: "household-spending",
    id: "h6",
    ask: "Which month had the highest spending?",
    gold: [
      "SELECT date_trunc('month', date) FROM data GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 1",
      "SELECT month(date) FROM data GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 1",
      "SELECT strftime(date, '%Y-%m') FROM data GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 1",
      "SELECT monthname(date) FROM data GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 1",
    ],
  },
  { dataset: "household-spending", id: "h7", ask: "How many transactions were over 100?", gold: ["SELECT count(*) FROM data WHERE amount > 100"] },
  { dataset: "household-spending", id: "h8", ask: "What percentage of spending is on non-essential items?", gold: ["SELECT sum(amount) FILTER (WHERE essential = 'No') / sum(amount) FROM data"], scales: [1, 100] },
  { dataset: "household-spending", id: "h9", ask: "What is the largest single expense in each account?", gold: ["SELECT account, max(amount) FROM data GROUP BY 1"] },
  { dataset: "household-spending", id: "h10", ask: "What is the average spending per month?", gold: ["SELECT sum(amount) / count(DISTINCT date_trunc('month', date)) FROM data"] },

  // ---- marketing performance ----
  { dataset: "marketing-performance", id: "m1", ask: "What was the total ad spend?", gold: ["SELECT sum(spend) FROM data"] },
  { dataset: "marketing-performance", id: "m2", ask: "What is the overall return on ad spend (revenue divided by spend)?", gold: ["SELECT sum(revenue) / sum(spend) FROM data"] },
  { dataset: "marketing-performance", id: "m3", ask: "Which channel has the best return on ad spend?", gold: ["SELECT channel FROM data GROUP BY 1 ORDER BY sum(revenue) / sum(spend) DESC LIMIT 1"] },
  { dataset: "marketing-performance", id: "m4", ask: "How many conversions did Email get in total?", gold: ["SELECT sum(conversions) FROM data WHERE channel = 'Email'"] },
  { dataset: "marketing-performance", id: "m5", ask: "What is the cost per click for each channel?", gold: ["SELECT channel, sum(spend) / sum(clicks) FROM data GROUP BY 1"] },
  { dataset: "marketing-performance", id: "m6", ask: "Which objective earns the most revenue?", gold: ["SELECT objective FROM data GROUP BY 1 ORDER BY sum(revenue) DESC LIMIT 1"] },
  { dataset: "marketing-performance", id: "m7", ask: "What is the overall click-through rate (clicks divided by impressions)?", gold: ["SELECT sum(clicks) / sum(impressions) FROM data"], scales: [1, 100] },
  { dataset: "marketing-performance", id: "m8", ask: "Which week had the highest total revenue?", gold: ["SELECT week_start FROM data GROUP BY 1 ORDER BY sum(revenue) DESC LIMIT 1"] },
  { dataset: "marketing-performance", id: "m9", ask: "Which channel turns clicks into conversions best (conversions divided by clicks)?", gold: ["SELECT channel FROM data GROUP BY 1 ORDER BY sum(conversions) * 1.0 / sum(clicks) DESC LIMIT 1"] },
  { dataset: "marketing-performance", id: "m10", ask: "What was the return on ad spend from July onwards?", gold: ["SELECT sum(revenue) / sum(spend) FROM data WHERE week_start >= DATE '2025-07-01'"] },

  // ---- support tickets ----
  { dataset: "support-tickets", id: "s1", ask: "How many tickets are there?", gold: ["SELECT count(*) FROM data"] },
  { dataset: "support-tickets", id: "s2", ask: "What is the average resolution time in hours for Urgent tickets?", gold: ["SELECT avg(resolution_hours) FROM data WHERE priority = 'Urgent'"] },
  { dataset: "support-tickets", id: "s3", ask: "Which channel has the lowest average satisfaction?", gold: ["SELECT channel FROM data GROUP BY 1 ORDER BY avg(satisfaction) ASC LIMIT 1"] },
  { dataset: "support-tickets", id: "s4", ask: "How many tickets are there for each priority?", gold: ["SELECT priority, count(*) FROM data GROUP BY 1"] },
  { dataset: "support-tickets", id: "s5", ask: "Which category has the fewest tickets?", gold: ["SELECT category FROM data GROUP BY 1 ORDER BY count(*) ASC LIMIT 1"] },
  { dataset: "support-tickets", id: "s6", ask: "What is the average first response time in minutes for Chat?", gold: ["SELECT avg(first_response_minutes) FROM data WHERE channel = 'Chat'"] },
  {
    dataset: "support-tickets",
    id: "s7",
    ask: "Which day of the week has the most tickets?",
    gold: [
      "SELECT dayname(created_date) FROM data GROUP BY 1 ORDER BY count(*) DESC LIMIT 1",
      "SELECT dayofweek(created_date) FROM data GROUP BY 1 ORDER BY count(*) DESC LIMIT 1",
      "SELECT isodow(created_date) FROM data GROUP BY 1 ORDER BY count(*) DESC LIMIT 1",
      "SELECT strftime(created_date, '%A') FROM data GROUP BY 1 ORDER BY count(*) DESC LIMIT 1",
    ],
  },
  { dataset: "support-tickets", id: "s8", ask: "What share of tickets were resolved within 8 hours?", gold: ["SELECT count(*) FILTER (WHERE resolution_hours <= 8) * 1.0 / count(*) FROM data"], scales: [1, 100] },
  { dataset: "support-tickets", id: "s9", ask: "What is the median resolution time in hours for each priority?", gold: ["SELECT priority, median(resolution_hours) FROM data GROUP BY 1"] },
  { dataset: "support-tickets", id: "s10", ask: "Which priority has the biggest gap between its average and its median resolution time?", gold: ["SELECT priority FROM data GROUP BY 1 ORDER BY abs(avg(resolution_hours) - median(resolution_hours)) DESC LIMIT 1"] },
];
