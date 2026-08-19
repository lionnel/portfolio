//import YahooFinance from "yahoo-finance2";

const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
const YAML = require("yaml");
const YahooFinance = require("yahoo-finance2").default;
//const YahooFinance = require("yahoo-finance2").YahooFinance;
const yahooFinance = new YahooFinance({
  //  ...options, // optional
  suppressNotices: ["yahooSurvey"], // optional
});

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "portfolio.yml");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const defaultPortfolio = {
  positions: [
    {
      symbol: "TTE.PA",
      name: "TotalEnergies SE",
      shares: 10,
    },
  ],
};

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, YAML.stringify(defaultPortfolio), "utf8");
  }
}

async function readPortfolio() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return YAML.parse(raw) || { positions: [] };
}

async function writePortfolio(portfolio) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, YAML.stringify(portfolio), "utf8");
}

function isMoreThan3DaysAgo(dateString) {
  try {
    const targetDate = new Date(dateString);
    const now = new Date();
    const diffMs = now - targetDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > 3;
  }
  catch {
    return true;
  }
}

async function enrichPosition(position, portfolio) {
  if (position.symbol) {
    let cache = {};
    if (portfolio.cache && portfolio.cache[position.symbol]) {
      cache = portfolio.cache[position.symbol];
      if (cache.yesterdayQuotation && isMoreThan3DaysAgo(cache.yesterdayQuotation)) {
        cache={}
      }
    } else {
      const quote = await yahooFinance.quote(position.symbol);
      if (quote) {
        const price = Number(quote.regularMarketPreviousClose || 0);
        const quotationDay = new Date(quote.regularMarketTime);
        quotationDay.setUTCDate(quotationDay.getUTCDate() - 1);
        const yesterdayQuotation = quotationDay.toISOString().split("T")[0];
        const currency = quote.currency || "EUR";
        cache = { price: price, currency: currency, yesterdayQuotation:yesterdayQuotation };
        if (!portfolio.cache) {
          portfolio.cache = {};
        }
        portfolio.cache[position.symbol] = cache;
      } else {
        console.error("Impossible to get quote for " + position.symbol);
      }
    }
    position.marketPrice = cache.price;
    position.marketValue = Number((position.shares * cache.price).toFixed(2));
    const mapping = {
      PA: "1rP",
      AS: "1rA"
    };

    function transform(value) {
      const [first, second] = value.split(".");
      const mappedSecond = mapping[second] ?? second;
      return `https://www.boursorama.com/cours/${mappedSecond}${first}`;
    }
    position.url = transform(position.symbol)
  }
}

async function enrichPortfolio(portfolio) {
  for(position of portfolio.positions) {
    await enrichPosition(position, portfolio);
  }
  await writePortfolio(portfolio);
  return portfolio;
}

app.get("/api/portfolio", async (req, res) => {
  try {
    let portfolio = await readPortfolio();
    portfolio = await enrichPortfolio(portfolio);
    const positions = portfolio.positions;
    res.json({ positions });
  } catch (error) {
    res.status(500).json({ error: "Failed to load portfolio" });
  }
});

app.put("/api/portfolio", async (req, res) => {
  try {
    const inputPositions = Array.isArray(req.body.positions)
      ? req.body.positions
      : [];
    let portfolio = readPortfolio();
    portfolio.positions = inputPositions;
    portfolio = await enrichedPositions(portfolio);
    await writePortfolio(portfolio);
    res.json({ positions: portfolio.positions });
  } catch (error) {
    res.status(500).json({ error: "Failed to save portfolio" });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) {
      return res.json({ results: [] });
    }

    const searchResult = await yahooFinance.search(query, {
      quotesCount: 10,
      newsCount: 0,
      enableFuzzyQuery: true,
    });

    const results = (searchResult.quotes || [])
      .filter(
        (item) =>
          item.symbol &&
          String(item.exchange || "")
            .toLowerCase()
            .includes("paris"),
      )
      .map((item) => ({
        symbol: item.symbol,
        name: item.longname || item.shortname || item.symbol,
        exchange: item.exchange,
        type: item.quoteType,
      }));

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: "Failed to search quotes" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, async () => {
  await ensureDataFile();
  console.log(`Server running on http://localhost:${PORT}`);
});
