import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());

app.get("/api/coingecko/markets", async (req, res) => {
  try {
    const apiKey = process.env.VITE_COINGECKO_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Clé API CoinGecko absente du fichier .env",
      });
    }

    const { ids, vs_currency = "usd" } = req.query;

    if (!ids) {
      return res.status(400).json({
        error: "Paramètre ids manquant",
      });
    }

    const url =
      `https://api.coingecko.com/api/v3/coins/markets` +
      `?vs_currency=${encodeURIComponent(vs_currency)}` +
      `&ids=${encodeURIComponent(ids)}`;

    const response = await fetch(url, {
      headers: {
        "x-cg-demo-api-key": apiKey,
        Accept: "application/json",
      },
    });

    const text = await response.text();

    if (!response.ok) {
      console.error(
        `CoinGecko HTTP ${response.status}:`,
        text
      );

      return res.status(response.status).json({
        error: "Erreur CoinGecko",
        status: response.status,
      });
    }

    res
      .status(200)
      .type("application/json")
      .send(text);
  } catch (error) {
    console.error("Erreur proxy CoinGecko:", error);

    res.status(500).json({
      error: "Erreur interne du proxy CoinGecko",
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Proxy CoinGecko actif sur http://localhost:${PORT}`
  );
});