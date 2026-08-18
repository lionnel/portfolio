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
  const data = YAML.parse(raw) || {};
  return {
    positions: Array.isArray(data.positions) ? data.positions : [],
  };
}

async function writePortfolio(portfolio) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, YAML.stringify(portfolio), "utf8");
}

function normalizePosition(position) {
  return {
    symbol: String(position.symbol || "").trim().toUpperCase(),
    name: String(position.name || "").trim(),
    shares: Number(position.shares || 0),
  };
}

async function enrichPosition(position) {
  try {
    if(!position.symbol) {
      const quote = await yahooFinance.quote(position.symbol);
      if (!quote) {
        console.log("Unknown position " + position.symbol)
      } else {
        const price = Number(quote.regularMarketPrice || 0);
        return {
          ...position,
          marketPrice: price,
          currency: quote.currency || "EUR",
          marketValue: Number((position.shares * price).toFixed(2)),
          quoteName: quote.longName || quote.shortName || position.name || position.symbol,
        };
      }
    }
    return {
      ...position,
      marketPrice: 0,
      currency: quote.currency || "EUR",
      marketValue: Number((position.shares * price).toFixed(2)),
      quoteName: quote.longName || quote.shortName || position.name || position.symbol,
    };
  } catch (error) {
    console.log("Retreiving position(" + position.symbol + "): " + error.message);
    return {
      ...position,
      marketPrice: null,
      currency: "EUR",
      marketValue: null,
      quoteName: position.name || position.symbol,
    }
  }
}

app.get("/api/portfolio", async (req, res) => {
  try {
    const portfolio = await readPortfolio();
    const positions = await Promise.all(
      portfolio.positions.map(async (position) => enrichPosition(normalizePosition(position)))
    );
    res.json({ positions });
  } catch (error) {
    res.status(500).json({ error: "Failed to load portfolio" });
  }
});

app.put("/api/portfolio", async (req, res) => {
  try {
    const inputPositions = Array.isArray(req.body.positions) ? req.body.positions : [];
    const positions = inputPositions
      .map(normalizePosition)
      .filter((position) => position.symbol && Number.isFinite(position.shares));

    await writePortfolio({ positions });

    const enrichedPositions = await Promise.all(positions.map(enrichPosition));
    res.json({ positions: enrichedPositions });
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
      .filter((item) => item.symbol && String(item.exchange || "").toLowerCase().includes("paris"))
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
