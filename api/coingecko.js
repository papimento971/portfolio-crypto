export default async function handler(req, res) {
  try {
    const apiKey = process.env.COINGECKO_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Clé API CoinGecko absente sur Vercel",
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
      console.error(`CoinGecko HTTP ${response.status}:`, text);

      return res.status(response.status).json({
        error: "Erreur CoinGecko",
        status: response.status,
      });
    }

    return res
      .status(200)
      .setHeader("Content-Type", "application/json")
      .send(text);
  } catch (error) {
    console.error("Erreur API CoinGecko:", error);

    return res.status(500).json({
      error: "Erreur interne API CoinGecko",
    });
  }
}