import { useState, useEffect } from "react";

export default function App() {
  const [assets, setAssets] = useState([
    { name: "Bitcoin", id: "bitcoin", quantity: 0.1, buyPrice: 30000, currentPrice: 40000 },
    { name: "Ethereum", id: "ethereum", quantity: 2, buyPrice: 2000, currentPrice: 2500 },
    { name: "Solana", id: "solana", quantity: 10, buyPrice: 80, currentPrice: 100 },
  ]);

  const [form, setForm] = useState({
    name: "",
    id: "",
    quantity: "",
    buyPrice: "",
  });

  const [usdToEur, setUsdToEur] = useState(0.92);

  useEffect(() => {
    async function fetchFX() {
      try {
        const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=EUR");
        const data = await res.json();
        setUsdToEur(data.rates.EUR);
      } catch (e) {
        console.log("FX error", e);
      }
    }

    fetchFX();
    const interval = setInterval(fetchFX, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchPrices() {
      try {
        const ids = assets.map((a) => a.id).join(",");
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
        );
        const data = await res.json();

        setAssets((prev) =>
          prev.map((a) => ({
            ...a,
            currentPrice: data[a.id]?.usd || a.currentPrice,
          }))
        );
      } catch (e) {
        console.log("Crypto error", e);
      }
    }

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  function addAsset() {
    if (!form.id) return;

    setAssets([
      ...assets,
      {
        name: form.name || form.id,
        id: form.id.toLowerCase(),
        quantity: Number(form.quantity || 0),
        buyPrice: Number(form.buyPrice || 0),
        currentPrice: 0,
      },
    ]);

    setForm({ name: "", id: "", quantity: "", buyPrice: "" });
  }

  function deleteAsset(index) {
    setAssets(assets.filter((_, i) => i !== index));
  }

  const totalValueUSD = assets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0);
  const totalInvestedUSD = assets.reduce((sum, a) => sum + a.quantity * a.buyPrice, 0);
  const profitUSD = totalValueUSD - totalInvestedUSD;
  const totalValueEUR = totalValueUSD * usdToEur;
  const profitEUR = profitUSD * usdToEur;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>📊 Live Dashboard</h1>

      <div style={styles.formGrid}>
        <input
          style={styles.input}
          placeholder="Nom"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <input
          style={styles.input}
          placeholder="ID"
          value={form.id}
          onChange={(e) => setForm({ ...form, id: e.target.value })}
        />

        <input
          style={styles.input}
          type="number"
          placeholder="Quantité"
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        />

        <input
          style={styles.input}
          type="number"
          placeholder="Prix achat"
          value={form.buyPrice}
          onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
        />

        <button style={styles.addButton} onClick={addAsset}>
          Ajouter
        </button>
      </div>

      <div style={styles.mobileList}>
        {assets.map((a, i) => {
          const value = a.quantity * a.currentPrice;
          const diff = value - a.quantity * a.buyPrice;

          return (
            <div key={i} style={styles.cryptoCard}>
              <h2 style={styles.cardTitle}>{a.name}</h2>

              <div style={styles.line}>
                <span>Quantité</span>
                <strong>{a.quantity}</strong>
              </div>

              <div style={styles.line}>
                <span>Prix achat</span>
                <strong>{a.buyPrice} $</strong>
              </div>

              <div style={styles.line}>
                <span>Prix actuel</span>
                <strong>{a.currentPrice?.toFixed?.(2)} $</strong>
              </div>

              <div style={styles.line}>
                <span>Valeur</span>
                <strong>{value.toFixed(2)} $</strong>
              </div>

              <div style={styles.profitLine}>
                <span>Profit</span>
                <strong style={{ color: diff >= 0 ? "lightgreen" : "red" }}>
                  {diff.toFixed(2)} $
                </strong>
              </div>

              <button style={styles.deleteButton} onClick={() => deleteAsset(i)}>
                Supprimer
              </button>
            </div>
          );
        })}
      </div>

      <div style={styles.totalBox}>
        <h2>💰 Total USD</h2>
        <h1>{totalValueUSD.toFixed(2)} $</h1>

        <h2 style={{ color: profitUSD >= 0 ? "lightgreen" : "red" }}>
          Bénéfice USD : {profitUSD.toFixed(2)} $
        </h2>
      </div>

      <div style={styles.totalBox}>
        <h2>💶 EUR en direct</h2>
        <p>1 USD = {usdToEur} EUR</p>
        <h1>{totalValueEUR.toFixed(2)} €</h1>

        <h2 style={{ color: profitEUR >= 0 ? "lightgreen" : "red" }}>
          Bénéfice EUR : {profitEUR.toFixed(2)} €
        </h2>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 16,
    fontFamily: "Arial",
    background: "#0f172a",
    color: "white",
    minHeight: "100vh",
    boxSizing: "border-box",
  },

  title: {
    textAlign: "center",
    fontSize: 32,
    marginBottom: 24,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginBottom: 24,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "22px 14px",
    fontSize: 18,
    borderRadius: 14,
    border: "2px solid #334155",
    background: "#1e293b",
    color: "white",
  },

  addButton: {
    gridColumn: "1 / 3",
    padding: 20,
    fontSize: 22,
    fontWeight: "bold",
    borderRadius: 14,
    border: "none",
    background: "#22c55e",
    color: "white",
  },

  mobileList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 16,
  },

  cryptoCard: {
    background: "#1e293b",
    padding: 18,
    borderRadius: 16,
    border: "1px solid #334155",
  },

  cardTitle: {
    marginTop: 0,
    fontSize: 26,
  },

  line: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 18,
    marginBottom: 10,
  },

  profitLine: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 20,
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid #475569",
  },

  deleteButton: {
    width: "100%",
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    border: "none",
    background: "#ef4444",
    color: "white",
    fontWeight: "bold",
    fontSize: 17,
  },

  totalBox: {
    marginTop: 18,
    background: "#111827",
    padding: 18,
    borderRadius: 16,
    border: "1px solid #334155",
    textAlign: "center",
  },
};
