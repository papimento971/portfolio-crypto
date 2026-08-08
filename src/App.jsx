import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import ldLogo from "./assets/ld-logo.png";

export default function App() {
  const [assets, setAssets] = useState([]);

  const [form, setForm] = useState({
    search: "",
    quantity: "",
    buyPrice: "",
  });

  const [selectedToken, setSelectedToken] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [editingAsset, setEditingAsset] = useState(null);
  const [transactionType, setTransactionType] = useState("purchase");
  const [transactionForm, setTransactionForm] = useState({
    quantity: "",
    unitPrice: "",
  });
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState("");

  const [historyAsset, setHistoryAsset] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [undoingTransactionId, setUndoingTransactionId] = useState(null);

  const [usdToEur, setUsdToEur] = useState(0.92);
  const [message, setMessage] = useState("");

  const [showAmounts, setShowAmounts] = useState(() => {
    const savedValue = localStorage.getItem("portfolio-show-amounts");
    return savedValue !== "false";
  });

  useEffect(() => {
    localStorage.setItem(
      "portfolio-show-amounts",
      String(showAmounts)
    );
  }, [showAmounts]);

  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    const { data, error } = await supabase
      .from("portfolios")
      .select("*")
      .order("id");

    if (error) {
      console.error("Erreur chargement :", error);
      setMessage("Impossible de charger le portefeuille.");
      return;
    }

    const formattedAssets = data.map((item) => ({
      dbId: item.id,
      id: item.crypto,
      name: item.crypto,
      symbol: "",
      image: "",
      quantity: Number(item.quantite || 0),
      buyPrice: Number(item.prix_achat || 0),
      currentPrice: 0,
      priceChange24h: 0,
    }));

    setAssets(formattedAssets);
  }

  useEffect(() => {
    const searchText = form.search.trim();

    if (selectedToken && searchText === selectedToken.name) {
      setSearchResults([]);
      return;
    }

    if (searchText.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);

      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(
            searchText
          )}`
        );

        if (!response.ok) {
          throw new Error("Erreur de recherche CoinGecko");
        }

        const data = await response.json();

        const results = (data.coins || []).slice(0, 8).map((coin) => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol?.toUpperCase() || "",
          image: coin.large || coin.thumb || "",
          marketCapRank: coin.market_cap_rank,
        }));

        setSearchResults(results);

        const exactMatches = results.filter(
          (coin) =>
            coin.name.toLowerCase() === searchText.toLowerCase() ||
            coin.symbol.toLowerCase() === searchText.toLowerCase()
        );

        if (exactMatches.length === 1) {
          selectToken(exactMatches[0]);
        }
      } catch (error) {
        console.error("Erreur recherche crypto :", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [form.search, selectedToken]);

  function selectToken(token) {
    setSelectedToken(token);
    setForm((previousForm) => ({
      ...previousForm,
      search: token.name,
    }));
    setSearchResults([]);
    setMessage("");
  }

  function resetForm() {
    setForm({
      search: "",
      quantity: "",
      buyPrice: "",
    });

    setSelectedToken(null);
    setSearchResults([]);
  }

  async function insertTransaction({
    portfolioId,
    crypto,
    type,
    quantity,
    unitPrice,
    quantityBefore,
    averagePriceBefore,
    quantityAfter,
    averagePriceAfter,
  }) {
    const { error } = await supabase.from("portfolio_transactions").insert([
      {
        portfolio_id: portfolioId,
        crypto,
        type,
        quantity,
        unit_price: unitPrice,
        quantity_before: quantityBefore,
        average_price_before: averagePriceBefore,
        quantity_after: quantityAfter,
        average_price_after: averagePriceAfter,
      },
    ]);

    if (error) {
      throw error;
    }
  }

  useEffect(() => {
    async function fetchFX() {
      try {
        const response = await fetch(
          "https://api.exchangerate.host/latest?base=USD&symbols=EUR"
        );

        if (!response.ok) {
          throw new Error("Erreur taux de change");
        }

        const data = await response.json();
        const rate = Number(data?.rates?.EUR);

        if (rate > 0) {
          setUsdToEur(rate);
        }
      } catch (error) {
        console.error("Erreur taux USD/EUR :", error);
      }
    }

    fetchFX();

    const interval = setInterval(fetchFX, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (assets.length === 0) {
      return;
    }

    let isCancelled = false;

    async function fetchPricesAndMetadata() {
      try {
        const uniqueIds = [...new Set(assets.map((asset) => asset.id))]
          .filter(Boolean)
          .join(",");

        if (!uniqueIds) {
          return;
        }

        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${uniqueIds}&price_change_percentage=24h`
        );

        if (!response.ok) {
          throw new Error("Erreur prix CoinGecko");
        }

        const data = await response.json();

        if (isCancelled) {
          return;
        }

        const coinMap = new Map(
          data.map((coin) => [
            coin.id,
            {
              name: coin.name,
              symbol: coin.symbol?.toUpperCase() || "",
              image: coin.image || "",
              currentPrice: Number(coin.current_price || 0),
              priceChange24h: Number(
                coin.price_change_percentage_24h || 0
              ),
            },
          ])
        );

        setAssets((previousAssets) =>
          previousAssets.map((asset) => {
            const coinData = coinMap.get(asset.id);

            if (!coinData) {
              return asset;
            }

            return {
              ...asset,
              ...coinData,
            };
          })
        );
      } catch (error) {
        console.error("Erreur prix crypto :", error);
      }
    }

    fetchPricesAndMetadata();

    const interval = setInterval(fetchPricesAndMetadata, 30000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [assets.length]);

  async function addAsset() {
    const quantity = Number(form.quantity);
    const buyPrice = Number(form.buyPrice);

    if (!selectedToken) {
      setMessage("Sélectionne une crypto dans la liste.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage("Entre une quantité supérieure à zéro.");
      return;
    }

    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      setMessage("Entre un prix d’achat supérieur à zéro.");
      return;
    }

    setIsAdding(true);
    setMessage("");

    try {
      const existingAsset = assets.find(
        (asset) => asset.id === selectedToken.id
      );

      if (existingAsset) {
        const quantityBefore = existingAsset.quantity;
        const averagePriceBefore = existingAsset.buyPrice;
        const oldInvestment = quantityBefore * averagePriceBefore;
        const newInvestment = quantity * buyPrice;
        const quantityAfter = quantityBefore + quantity;
        const averagePriceAfter =
          (oldInvestment + newInvestment) / quantityAfter;

        const { error } = await supabase
          .from("portfolios")
          .update({
            quantite: quantityAfter,
            prix_achat: averagePriceAfter,
          })
          .eq("id", existingAsset.dbId);

        if (error) throw error;

        await insertTransaction({
          portfolioId: existingAsset.dbId,
          crypto: selectedToken.id,
          type: "purchase",
          quantity,
          unitPrice: buyPrice,
          quantityBefore,
          averagePriceBefore,
          quantityAfter,
          averagePriceAfter,
        });

        setMessage(
          `${selectedToken.name} a été mis à jour avec le nouveau prix moyen.`
        );
      } else {
        const { data, error } = await supabase
          .from("portfolios")
          .insert([
            {
              crypto: selectedToken.id,
              quantite: quantity,
              prix_achat: buyPrice,
            },
          ])
          .select("id")
          .single();

        if (error) throw error;

        await insertTransaction({
          portfolioId: data.id,
          crypto: selectedToken.id,
          type: "purchase",
          quantity,
          unitPrice: buyPrice,
          quantityBefore: 0,
          averagePriceBefore: 0,
          quantityAfter: quantity,
          averagePriceAfter: buyPrice,
        });

        setMessage(`${selectedToken.name} a été ajouté au portefeuille.`);
      }

      resetForm();
      await loadAssets();
    } catch (error) {
      console.error("Erreur ajout / mise à jour :", error);
      setMessage(
        `Enregistrement impossible : ${
          error?.message || "erreur inconnue"
        }`
      );
    } finally {
      setIsAdding(false);
    }
  }

  function openTransactionForm(asset, type = "purchase") {
    setEditingAsset(asset);
    setTransactionType(type);
    setTransactionForm({ quantity: "", unitPrice: "" });
    setTransactionMessage("");
    setMessage("");
  }

  function closeTransactionForm() {
    setEditingAsset(null);
    setTransactionType("purchase");
    setTransactionForm({ quantity: "", unitPrice: "" });
    setTransactionMessage("");
    setIsSavingTransaction(false);
  }

  async function saveTransaction() {
    if (!editingAsset || isSavingTransaction) return;

    const quantity = Number(transactionForm.quantity);
    const unitPrice =
      transactionType === "purchase"
        ? Number(transactionForm.unitPrice)
        : 0;
    const quantityBefore = Number(editingAsset.quantity);
    const averagePriceBefore = Number(editingAsset.buyPrice);
    const portfolioId = editingAsset.dbId;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTransactionMessage("Entre une quantité supérieure à zéro.");
      return;
    }

    if (
      transactionType === "purchase" &&
      (!Number.isFinite(unitPrice) || unitPrice <= 0)
    ) {
      setTransactionMessage("Entre le prix du nouvel achat.");
      return;
    }

    if (transactionType === "sale" && quantity > quantityBefore) {
      setTransactionMessage(
        `La quantité vendue ne peut pas dépasser ${formatNumber(
          quantityBefore
        )}.`
      );
      return;
    }

    setIsSavingTransaction(true);
    setTransactionMessage("");

    try {
      if (transactionType === "purchase") {
        const quantityAfter = quantityBefore + quantity;
        const averagePriceAfter =
          (quantityBefore * averagePriceBefore + quantity * unitPrice) /
          quantityAfter;

        const { error } = await supabase
          .from("portfolios")
          .update({
            quantite: quantityAfter,
            prix_achat: averagePriceAfter,
          })
          .eq("id", portfolioId);

        if (error) throw error;

        await insertTransaction({
          portfolioId,
          crypto: editingAsset.id,
          type: "purchase",
          quantity,
          unitPrice,
          quantityBefore,
          averagePriceBefore,
          quantityAfter,
          averagePriceAfter,
        });

        setMessage(
          `Nouvel achat enregistré pour ${editingAsset.name}. Prix moyen recalculé.`
        );
      } else {
        const quantityAfter = quantityBefore - quantity;
        const averagePriceAfter = quantityAfter > 0 ? averagePriceBefore : 0;

        if (quantityAfter === 0) {
          const confirmed = window.confirm(
            `Cette vente clôture entièrement ${editingAsset.name}. La position et tout son historique seront supprimés. Continuer ?`
          );

          if (!confirmed) {
            setIsSavingTransaction(false);
            return;
          }

          const { error } = await supabase
            .from("portfolios")
            .delete()
            .eq("id", portfolioId);

          if (error) throw error;

          setMessage(
            `${editingAsset.name} a été entièrement vendu et retiré du portefeuille.`
          );
        } else {
          const { error } = await supabase
            .from("portfolios")
            .update({ quantite: quantityAfter })
            .eq("id", portfolioId);

          if (error) throw error;

          await insertTransaction({
            portfolioId,
            crypto: editingAsset.id,
            type: "sale",
            quantity,
            unitPrice,
            quantityBefore,
            averagePriceBefore,
            quantityAfter,
            averagePriceAfter,
          });

          setMessage(
            `Vente partielle enregistrée pour ${editingAsset.name}. Le prix moyen restant est inchangé.`
          );
        }
      }

      closeTransactionForm();
      await loadAssets();
    } catch (error) {
      console.error("Erreur transaction :", error);
      setTransactionMessage(
        `Enregistrement impossible : ${
          error?.message || "erreur inconnue"
        }`
      );
    } finally {
      setIsSavingTransaction(false);
    }
  }

  async function openHistory(asset) {
    setHistoryAsset(asset);
    setHistoryItems([]);
    setHistoryMessage("");
    setIsLoadingHistory(true);

    const { data, error } = await supabase
      .from("portfolio_transactions")
      .select("*")
      .eq("portfolio_id", asset.dbId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur historique :", error);
      setHistoryMessage(
        `Impossible de charger l’historique : ${error.message}`
      );
    } else {
      setHistoryItems(data || []);
    }

    setIsLoadingHistory(false);
  }

  function closeHistory() {
    setHistoryAsset(null);
    setHistoryItems([]);
    setHistoryMessage("");
    setUndoingTransactionId(null);
  }

  async function undoTransaction(transaction) {
    if (!historyAsset || undoingTransactionId) return;

    const confirmed = window.confirm(
      `Annuler cette ${
        transaction.type === "purchase" ? "transaction d’achat" : "vente"
      } ? La position reviendra exactement à son état précédent.`
    );

    if (!confirmed) return;

    setUndoingTransactionId(transaction.id);
    setHistoryMessage("");

    try {
      const quantityBefore = Number(transaction.quantity_before || 0);
      const averagePriceBefore = Number(
        transaction.average_price_before || 0
      );

      if (quantityBefore <= 0) {
        const { error } = await supabase
          .from("portfolios")
          .delete()
          .eq("id", historyAsset.dbId);

        if (error) throw error;
        closeHistory();
        setMessage(
          `${historyAsset.name} a été retiré : son achat initial a été annulé.`
        );
      } else {
        const { error: updateError } = await supabase
          .from("portfolios")
          .update({
            quantite: quantityBefore,
            prix_achat: averagePriceBefore,
          })
          .eq("id", historyAsset.dbId);

        if (updateError) throw updateError;

        const { error: deleteError } = await supabase
          .from("portfolio_transactions")
          .delete()
          .eq("id", transaction.id);

        if (deleteError) throw deleteError;

        setHistoryItems((items) =>
          items.filter((item) => item.id !== transaction.id)
        );
        setMessage("Transaction annulée. La position a été restaurée.");
      }

      await loadAssets();
    } catch (error) {
      console.error("Erreur annulation transaction :", error);
      setHistoryMessage(
        `Annulation impossible : ${error?.message || "erreur inconnue"}`
      );
    } finally {
      setUndoingTransactionId(null);
    }
  }

  async function deleteAsset(asset) {
    const confirmed = window.confirm(
      `Supprimer ${asset.name} du portefeuille ?`
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("portfolios")
      .delete()
      .eq("id", asset.dbId);

    if (error) {
      console.error("Erreur suppression :", error);
      setMessage("Erreur lors de la suppression.");
      return;
    }

    setMessage(`${asset.name} a été supprimé.`);
    await loadAssets();
  }

  const totals = useMemo(() => {
    return assets.reduce(
      (result, asset) => {
        const currentValue =
          asset.quantity * asset.currentPrice;

        const investedValue =
          asset.quantity * asset.buyPrice;

        result.totalValueUSD += currentValue;
        result.totalInvestedUSD += investedValue;

        return result;
      },
      {
        totalValueUSD: 0,
        totalInvestedUSD: 0,
      }
    );
  }, [assets]);

  const profitUSD =
    totals.totalValueUSD - totals.totalInvestedUSD;

  const totalValueEUR =
    totals.totalValueUSD * usdToEur;

  const totalInvestedEUR =
    totals.totalInvestedUSD * usdToEur;

  const profitEUR =
    profitUSD * usdToEur;

  const globalPerformance =
    totals.totalInvestedUSD > 0
      ? (profitUSD / totals.totalInvestedUSD) * 100
      : 0;

  function getPriceDecimals(value) {
    const v = Math.abs(Number(value) || 0);
    if (v >= 100) return 2;
    if (v >= 1) return 3;
    if (v >= 0.1) return 4;
    return 5;
  }

  function formatUSD(value, dynamicPrecision = false) {
    const decimals = dynamicPrecision ? getPriceDecimals(value) : 2;
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value || 0);
  }

  function formatEUR(value) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  function formatNumber(value, maximumFractionDigits = 8) {
    return new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits,
    }).format(value || 0);
  }

  return (
    <div style={styles.page} className="ld-page">
      <style>{responsiveCss}</style>
      <div style={styles.container} className="ld-container">
        <header style={styles.header} className="ld-header">
          <div style={styles.headerCopy}>
            <p style={styles.eyebrow}>Portfolio crypto</p>
            <h1 style={styles.title}>Live Dashboard</h1>
            <p style={styles.subtitle}>
              Suivi automatique des prix et de tes performances
            </p>
          </div>

          <div style={styles.logoFrame}>
            <img
              src={ldLogo}
              alt="Logo Live Dashboard"
              style={styles.brandLogo}
            />
          </div>
        </header>

        <section style={styles.performanceTopCard} className="ld-performance">
          <span style={styles.performanceTopLabel}>
            Performance totale du portefeuille
          </span>

          <strong
            style={{
              ...styles.performanceTopValue,
              color:
                globalPerformance >= 0
                  ? "#4ade80"
                  : "#fb7185",
            }}
          >
            {globalPerformance >= 0 ? "+" : ""}
            {globalPerformance.toFixed(2)} %
          </strong>

          <span style={styles.performanceTopDescription}>
            Depuis le prix moyen d’achat
          </span>
        </section>

        <section style={styles.addSection} className="ld-add-section">
          <div style={styles.sectionHeading}>
            <div style={styles.sectionTitleRow}>
              <span style={styles.addIcon}>+</span>
              <div>
                <h2 style={styles.sectionTitle}>
                  Ajouter une crypto
                </h2>

                <p style={styles.sectionDescription}>
                  Recherche par nom ou symbole
                </p>
              </div>
            </div>
          </div>

          <div style={styles.searchWrapper}>
            <label style={styles.label}>
              Crypto
            </label>

            <input
              style={styles.input}
              type="text"
              placeholder="Exemple : Bitcoin, BTC, Solana..."
              value={form.search}
              autoComplete="off"
              onChange={(event) => {
                setForm({
                  ...form,
                  search: event.target.value,
                });

                setSelectedToken(null);
                setMessage("");
              }}
            />

            {isSearching && (
              <div style={styles.searchStatus}>
                Recherche en cours...
              </div>
            )}

            {searchResults.length > 0 && (
              <div style={styles.resultsBox}>
                {searchResults.map((token) => (
                  <button
                    key={token.id}
                    type="button"
                    style={styles.resultButton}
                    onClick={() => selectToken(token)}
                  >
                    <img
                      src={token.image}
                      alt=""
                      style={styles.resultLogo}
                    />

                    <div style={styles.resultText}>
                      <strong style={styles.resultName}>
                        {token.name}
                      </strong>

                      <span style={styles.resultSymbol}>
                        {token.symbol}
                      </span>
                    </div>

                    <span style={styles.rank}>
                      {token.marketCapRank
                        ? `#${token.marketCapRank}`
                        : "Non classé"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedToken && (
            <div style={styles.selectedToken}>
              <img
                src={selectedToken.image}
                alt=""
                style={styles.selectedLogo}
              />

              <div>
                <strong style={styles.selectedName}>
                  {selectedToken.name}
                </strong>

                <span style={styles.selectedSymbol}>
                  {selectedToken.symbol} · ID CoinGecko :{" "}
                  {selectedToken.id}
                </span>
              </div>
            </div>
          )}

          <div style={styles.formGrid} className="ld-form-grid">
            <div>
              <label style={styles.label}>
                Quantité achetée
              </label>

              <input
                style={styles.input}
                type="number"
                min="0"
                step="any"
                placeholder="Exemple : 0,25"
                value={form.quantity}
                onChange={(event) =>
                  setForm({
                    ...form,
                    quantity: event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label style={styles.label}>
                Prix d’achat unitaire en USD
              </label>

              <input
                style={styles.input}
                type="number"
                min="0"
                step="any"
                placeholder="Exemple : 65 000"
                value={form.buyPrice}
                onChange={(event) =>
                  setForm({
                    ...form,
                    buyPrice: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <button
            style={{
              ...styles.addButton,
              opacity: isAdding ? 0.65 : 1,
              cursor: isAdding ? "wait" : "pointer",
            }}
            type="button"
            disabled={isAdding}
            onClick={addAsset}
          >
            {isAdding
              ? "Enregistrement..."
              : "Ajouter au portefeuille"}
          </button>
        </section>

        {message && (
          <div style={styles.message}>
            {message}
          </div>
        )}

        <section style={styles.portfolioSection}>
          <div style={styles.sectionHeading}>
            <div>
              <h2 style={styles.sectionTitle}>
                Mes positions
              </h2>

              <p style={styles.sectionDescription}>
                {assets.length} crypto
                {assets.length > 1 ? "s" : ""} enregistrée
                {assets.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {assets.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>₿</div>

              <h3 style={styles.emptyTitle}>
                Ton portefeuille est vide
              </h3>

              <p style={styles.emptyText}>
                Recherche une crypto ci-dessus pour ajouter ta
                première position.
              </p>
            </div>
          ) : (
            <div style={styles.cardGrid} className="ld-card-grid">
              {assets.map((asset) => {
                const currentValue =
                  asset.quantity * asset.currentPrice;

                const investedValue =
                  asset.quantity * asset.buyPrice;

                const profit =
                  currentValue - investedValue;

                const performance =
                  investedValue > 0
                    ? (profit / investedValue) * 100
                    : 0;

                return (
                  <article
                    key={asset.dbId}
                    style={styles.cryptoCard}
                    className="ld-crypto-card"
                  >
                    <div style={styles.cardHeader} className="ld-card-header">
                      <div style={styles.tokenIdentity} className="ld-token-identity">
                        {asset.image ? (
                          <img
                            src={asset.image}
                            alt=""
                            style={styles.tokenLogo}
                            className="ld-token-logo"
                          />
                        ) : (
                          <div style={styles.logoPlaceholder} className="ld-token-logo ld-token-placeholder">
                            {asset.name
                              ?.slice(0, 1)
                              .toUpperCase()}
                          </div>
                        )}

                        <div>
                          <h3 style={styles.cardTitle} className="ld-card-title">
                            {asset.name}
                          </h3>

                          <span style={styles.cardSymbol} className="ld-card-symbol">
                            {asset.symbol || asset.id}
                          </span>
                        </div>
                      </div>

                      <div
                        className="ld-change-badge"
                        style={{
                          ...styles.changeBadge,
                          color:
                            asset.priceChange24h >= 0
                              ? "#4ade80"
                              : "#fb7185",
                          background:
                            asset.priceChange24h >= 0
                              ? "rgba(74, 222, 128, 0.12)"
                              : "rgba(251, 113, 133, 0.12)",
                        }}
                      >
                        {asset.priceChange24h >= 0
                          ? "+"
                          : ""}
                        {asset.priceChange24h.toFixed(2)} %
                      </div>
                    </div>

                    <div style={styles.priceBlock} className="ld-price-block">
                      <span style={styles.priceLabel} className="ld-price-label">
                        Prix actuel
                      </span>

                      <strong style={styles.currentPrice} className="ld-current-price">
                        {formatUSD(asset.currentPrice, true)}
                      </strong>
                    </div>

                    <div style={styles.dataRows} className="ld-data-rows">
                      <div style={styles.line} className="ld-data-line">
                        <span style={styles.lineLabel} className="ld-line-label">
                          Quantité
                        </span>

                        <strong style={styles.lineValue} className="ld-line-value">
                          {formatNumber(asset.quantity)}
                        </strong>
                      </div>

                      <div style={styles.line} className="ld-data-line">
                        <span style={styles.lineLabel} className="ld-line-label">
                          Prix moyen
                        </span>

                        <strong style={styles.lineValue} className="ld-line-value">
                          {formatUSD(asset.buyPrice, true)}
                        </strong>
                      </div>

                      <div style={styles.line} className="ld-data-line">
                        <span style={styles.lineLabel} className="ld-line-label">
                          Montant investi
                        </span>

                        <strong style={styles.lineValue} className="ld-line-value">
                          {formatUSD(investedValue)}
                        </strong>
                      </div>

                      <div style={styles.line} className="ld-data-line">
                        <span style={styles.lineLabel} className="ld-line-label">
                          Valeur actuelle
                        </span>

                        <strong style={styles.lineValue} className="ld-line-value">
                          {formatUSD(currentValue)}
                        </strong>
                      </div>
                    </div>

                    <div style={styles.profitBox} className="ld-profit-box">
                      <div>
                        <span style={styles.profitLabel} className="ld-profit-label">
                          Résultat
                        </span>

                        <strong
                          className="ld-profit-value"
                          style={{
                            ...styles.profitValue,
                            color:
                              profit >= 0
                                ? "#4ade80"
                                : "#fb7185",
                          }}
                        >
                          {profit >= 0 ? "+" : ""}
                          {formatUSD(profit)}
                        </strong>
                      </div>

                      <strong
                        className="ld-card-performance"
                        style={{
                          ...styles.performance,
                          color:
                            performance >= 0
                              ? "#4ade80"
                              : "#fb7185",
                        }}
                      >
                        {performance >= 0 ? "+" : ""}
                        {performance.toFixed(2)} %
                      </strong>
                    </div>

                    <div style={styles.cardActions} className="ld-card-actions">
                      <button
                        type="button"
                        style={styles.editButton}
                        className="ld-card-action ld-card-action--buy"
                        onClick={() => openTransactionForm(asset, "purchase")}
                      >
                        Acheter
                      </button>

                      <button
                        type="button"
                        style={styles.sellButton}
                        className="ld-card-action ld-card-action--sell"
                        onClick={() => openTransactionForm(asset, "sale")}
                      >
                        Vendre
                      </button>

                      <button
                        type="button"
                        style={styles.historyButton}
                        className="ld-card-action ld-card-action--history"
                        onClick={() => openHistory(asset)}
                      >
                        Historique
                      </button>

                      <button
                        type="button"
                        style={styles.deleteButton}
                        className="ld-card-action ld-card-action--delete"
                        onClick={() => deleteAsset(asset)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section style={styles.bottomSummarySection}>
          <div style={styles.bottomSummaryHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                Résumé du portefeuille
              </h2>

              <p style={styles.sectionDescription}>
                Montants en dollars et conversion en euros
              </p>
            </div>

            <button
              type="button"
              style={styles.visibilityButton}
              onClick={() => setShowAmounts((current) => !current)}
              aria-label={
                showAmounts
                  ? "Masquer les montants"
                  : "Afficher les montants"
              }
            >
              <span style={styles.visibilityIcon}>
                {showAmounts ? "◉" : "◌"}
              </span>
              {showAmounts ? "Masquer" : "Afficher"}
            </button>
          </div>

          <div style={styles.summaryGrid} className="ld-summary-grid">
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>
                Valeur actuelle
              </span>

              <strong style={styles.summaryValue}>
                {showAmounts
                  ? formatUSD(totals.totalValueUSD)
                  : "••••••"}
              </strong>

              <span style={styles.summarySecondary}>
                {showAmounts
                  ? formatEUR(totalValueEUR)
                  : "••••••"}
              </span>
            </div>

            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>
                Montant investi
              </span>

              <strong style={styles.summaryValue}>
                {showAmounts
                  ? formatUSD(totals.totalInvestedUSD)
                  : "••••••"}
              </strong>

              <span style={styles.summarySecondary}>
                {showAmounts
                  ? formatEUR(totalInvestedEUR)
                  : "••••••"}
              </span>
            </div>

            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>
                Bénéfice total
              </span>

              <strong
                style={{
                  ...styles.summaryValue,
                  color:
                    profitUSD >= 0
                      ? "#4ade80"
                      : "#fb7185",
                }}
              >
                {showAmounts
                  ? `${profitUSD >= 0 ? "+" : ""}${formatUSD(
                      profitUSD
                    )}`
                  : "••••••"}
              </strong>

              <span
                style={{
                  ...styles.summarySecondary,
                  color:
                    profitEUR >= 0
                      ? "#4ade80"
                      : "#fb7185",
                }}
              >
                {showAmounts
                  ? `${profitEUR >= 0 ? "+" : ""}${formatEUR(
                      profitEUR
                    )}`
                  : "••••••"}
              </span>
            </div>

          </div>
        </section>
      </div>

      {editingAsset && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.modalEyebrow}>
                  Nouvelle transaction
                </p>
                <h2 style={styles.modalTitle}>{editingAsset.name}</h2>
              </div>
              <button
                type="button"
                style={styles.closeButton}
                onClick={closeTransactionForm}
              >
                ×
              </button>
            </div>

            <div style={styles.transactionTabs}>
              <button
                type="button"
                style={{
                  ...styles.transactionTab,
                  ...(transactionType === "purchase"
                    ? styles.transactionTabActive
                    : {}),
                }}
                onClick={() => {
                  setTransactionType("purchase");
                  setTransactionMessage("");
                }}
              >
                Achat
              </button>
              <button
                type="button"
                style={{
                  ...styles.transactionTab,
                  ...(transactionType === "sale"
                    ? styles.transactionTabSaleActive
                    : {}),
                }}
                onClick={() => {
                  setTransactionType("sale");
                  setTransactionMessage("");
                }}
              >
                Vente
              </button>
            </div>

            <div style={styles.currentPositionBox}>
              <div style={styles.line}>
                <span style={styles.lineLabel}>Quantité actuelle</span>
                <strong style={styles.lineValue}>
                  {formatNumber(editingAsset.quantity)}
                </strong>
              </div>
              <div style={styles.line}>
                <span style={styles.lineLabel}>Prix moyen actuel</span>
                <strong style={styles.lineValue}>
                  {formatUSD(editingAsset.buyPrice, true)}
                </strong>
              </div>
            </div>

            {transactionType === "sale" && (
              <div style={styles.saleInformationBox}>
                Indique uniquement la quantité vendue. Le prix moyen des
                tokens restants restera inchangé.
              </div>
            )}

            <div style={styles.modalFields}>
              <div>
                <label style={styles.label}>
                  {transactionType === "purchase"
                    ? "Quantité achetée"
                    : "Quantité vendue"}
                </label>
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  max={
                    transactionType === "sale"
                      ? editingAsset.quantity
                      : undefined
                  }
                  step="any"
                  placeholder="Quantité"
                  value={transactionForm.quantity}
                  onChange={(event) =>
                    setTransactionForm({
                      ...transactionForm,
                      quantity: event.target.value,
                    })
                  }
                />
              </div>

              {transactionType === "purchase" && (
                <div>
                  <label style={styles.label}>
                    Prix du nouvel achat
                  </label>
                  <input
                    style={styles.input}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Prix unitaire en USD"
                    value={transactionForm.unitPrice}
                    onChange={(event) =>
                      setTransactionForm({
                        ...transactionForm,
                        unitPrice: event.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>

            {Number(transactionForm.quantity) > 0 &&
              (transactionType === "sale" ||
                Number(transactionForm.unitPrice) > 0) && (
                <div style={styles.previewBox}>
                  <span style={styles.previewLabel}>
                    {transactionType === "purchase"
                      ? "Nouveau prix moyen estimé"
                      : "Quantité restante après la vente"}
                  </span>
                  <strong style={styles.previewValue}>
                    {transactionType === "purchase"
                      ? formatUSD(
                          (editingAsset.quantity * editingAsset.buyPrice +
                            Number(transactionForm.quantity) *
                              Number(transactionForm.unitPrice)) /
                            (editingAsset.quantity +
                              Number(transactionForm.quantity)),
                          true
                        )
                      : formatNumber(
                          Math.max(
                            0,
                            editingAsset.quantity -
                              Number(transactionForm.quantity)
                          )
                        )}
                  </strong>
                  {transactionType === "sale" && (
                    <span style={styles.previewHint}>
                      Le prix moyen d’achat restant demeure inchangé.
                    </span>
                  )}
                </div>
              )}

            {transactionMessage && (
              <div style={styles.purchaseMessage}>
                {transactionMessage}
              </div>
            )}

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={closeTransactionForm}
              >
                Fermer
              </button>
              <button
                type="button"
                style={{
                  ...styles.confirmButton,
                  ...(transactionType === "sale"
                    ? styles.confirmSaleButton
                    : {}),
                  opacity: isSavingTransaction ? 0.65 : 1,
                  cursor: isSavingTransaction ? "wait" : "pointer",
                }}
                disabled={isSavingTransaction}
                onClick={saveTransaction}
              >
                {isSavingTransaction
                  ? "Enregistrement..."
                  : transactionType === "purchase"
                  ? "Enregistrer l’achat"
                  : "Enregistrer la vente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyAsset && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, maxWidth: 720 }}>
            <div style={styles.modalHeader}>
              <div>
                <p style={styles.modalEyebrow}>Historique détaillé</p>
                <h2 style={styles.modalTitle}>{historyAsset.name}</h2>
              </div>
              <button
                type="button"
                style={styles.closeButton}
                onClick={closeHistory}
              >
                ×
              </button>
            </div>

            {isLoadingHistory ? (
              <div style={styles.historyEmpty}>Chargement...</div>
            ) : historyItems.length === 0 ? (
              <div style={styles.historyEmpty}>
                Aucun historique détaillé. Les positions créées avant cette
                mise à jour ne disposent pas encore de transactions
                individuelles.
              </div>
            ) : (
              <div style={styles.historyList}>
                {historyItems.map((transaction, index) => {
                  const canUndo = index === 0;
                  const isPurchase = transaction.type === "purchase";
                  return (
                    <div key={transaction.id} style={styles.historyItem}>
                      <div style={styles.historyTopRow}>
                        <span
                          style={{
                            ...styles.historyType,
                            color: isPurchase ? "#86efac" : "#fda4af",
                            background: isPurchase
                              ? "rgba(34,197,94,.10)"
                              : "rgba(244,63,94,.10)",
                          }}
                        >
                          {isPurchase ? "Achat" : "Vente"}
                        </span>
                        <span style={styles.historyDate}>
                          {new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(transaction.created_at))}
                        </span>
                      </div>

                      <div style={styles.historyDetails}>
                        <span>
                          Quantité : <strong>{formatNumber(transaction.quantity)}</strong>
                        </span>
                        {transaction.type === "purchase" && (
                          <span>
                            Prix d’achat :{" "}
                            <strong>
                              {formatUSD(transaction.unit_price, true)}
                            </strong>
                          </span>
                        )}
                        <span>
                          Position : <strong>{formatNumber(transaction.quantity_before)}</strong> → <strong>{formatNumber(transaction.quantity_after)}</strong>
                        </span>
                        <span>
                          {transaction.type === "purchase"
                            ? "Prix moyen après : "
                            : "Prix moyen restant : "}
                          <strong>
                            {formatUSD(
                              transaction.average_price_after,
                              true
                            )}
                          </strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        style={{
                          ...styles.undoButton,
                          opacity: canUndo ? 1 : 0.45,
                          cursor: canUndo ? "pointer" : "not-allowed",
                        }}
                        disabled={!canUndo || undoingTransactionId === transaction.id}
                        onClick={() => undoTransaction(transaction)}
                        title={
                          canUndo
                            ? "Annuler la dernière transaction"
                            : "Seule la transaction la plus récente peut être annulée"
                        }
                      >
                        {undoingTransactionId === transaction.id
                          ? "Annulation..."
                          : canUndo
                          ? "Annuler cette transaction"
                          : "Transaction verrouillée"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {historyMessage && (
              <div style={styles.purchaseMessage}>{historyMessage}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const responsiveCss = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #020807; }
  button, input { font: inherit; }
  input::placeholder { color: #6f7773; opacity: 1; }
  input:focus { border-color: rgba(94, 219, 54, .78) !important; box-shadow: 0 0 0 3px rgba(66, 210, 38, .10), 0 0 28px rgba(38, 191, 30, .07); }
  button { transition: transform .18s ease, filter .18s ease, border-color .18s ease, background .18s ease; }
  button:hover { filter: brightness(1.08); }
  button:active { transform: translateY(1px); }
  @media (max-width: 720px) {
    .ld-page { padding: 18px 12px 36px !important; }
    .ld-header { align-items: center !important; gap: 14px !important; margin-bottom: 22px !important; }
    .ld-header h1 { font-size: clamp(34px, 10vw, 48px) !important; }
    .ld-header p:last-child { font-size: 14px !important; }
    .ld-performance { padding: 18px 14px !important; min-height: 138px !important; }
    .ld-add-section { padding: 18px 14px !important; }
    .ld-form-grid { grid-template-columns: 1fr !important; }
    .ld-card-grid, .ld-summary-grid { grid-template-columns: 1fr !important; }

    /* Cartes de positions : gabarit mobile compact et sans débordement. */
    .ld-card-grid {
      width: 100% !important;
      min-width: 0 !important;
      gap: 12px !important;
    }
    .ld-crypto-card {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      padding: 12px !important;
      border-radius: 16px !important;
      overflow: hidden !important;
    }
    .ld-card-header {
      align-items: center !important;
      gap: 6px !important;
      min-width: 0 !important;
    }
    .ld-token-identity {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      gap: 8px !important;
    }
    .ld-token-logo {
      width: 40px !important;
      height: 40px !important;
      flex: 0 0 40px !important;
    }
    .ld-card-title {
      max-width: 100% !important;
      font-size: 17px !important;
      line-height: 1.15 !important;
    }
    .ld-card-symbol {
      margin-top: 2px !important;
      font-size: 10px !important;
    }
    .ld-change-badge {
      padding: 6px 7px !important;
      font-size: 11px !important;
      white-space: nowrap !important;
    }
    .ld-price-block {
      margin: 8px 0 9px !important;
      gap: 2px !important;
    }
    .ld-price-label, .ld-profit-label {
      font-size: 11px !important;
    }
    .ld-current-price {
      font-size: 22px !important;
      line-height: 1.15 !important;
      overflow-wrap: anywhere !important;
    }
    .ld-data-rows { gap: 4px !important; }
    .ld-data-line {
      gap: 6px !important;
      min-width: 0 !important;
    }
    .ld-line-label {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      font-size: 12px !important;
    }
    .ld-line-value {
      flex: 0 1 58% !important;
      min-width: 0 !important;
      font-size: 12px !important;
      overflow-wrap: anywhere !important;
    }
    .ld-profit-box {
      align-items: center !important;
      gap: 8px !important;
      margin-top: 8px !important;
      padding-top: 8px !important;
    }
    .ld-profit-value {
      font-size: 17px !important;
      overflow-wrap: anywhere !important;
    }
    .ld-card-performance {
      flex-shrink: 0 !important;
      font-size: 15px !important;
      white-space: nowrap !important;
    }
    .ld-card-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 6px !important;
      margin-top: 8px !important;
    }
    .ld-card-action {
      width: 100% !important;
      min-width: 0 !important;
      padding: 8px 5px !important;
      font-size: 12px !important;
      line-height: 1.15 !important;
      white-space: nowrap !important;
    }
  }
  @media (max-width: 500px) {
    .ld-header { align-items: flex-start !important; }
    .ld-header > div:last-child { width: 82px !important; height: 82px !important; border-radius: 18px !important; }
    .ld-header h1 { font-size: 36px !important; }
    .ld-header p:first-child { font-size: 11px !important; }
    .ld-crypto-card { padding: 11px !important; }
    .ld-card-action { font-size: 12px !important; padding-inline: 4px !important; }
  }
`;

const styles = {
  page: {
    minHeight: "100vh",
    padding: "26px 18px 54px",
    background:
      "radial-gradient(circle at 18% -10%, rgba(18, 85, 57, 0.20), transparent 34%), radial-gradient(circle at 90% 7%, rgba(190, 137, 28, 0.07), transparent 28%), linear-gradient(180deg, #010706 0%, #020908 48%, #010504 100%)",
    color: "#f5f7f4",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  container: { width: "100%", maxWidth: 1180, margin: "0 auto" },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 24, marginBottom: 28, padding: "0 2px",
  },
  headerCopy: { minWidth: 0 },
  eyebrow: {
    margin: "0 0 8px", color: "#56c23d", fontSize: 13, fontWeight: 900,
    letterSpacing: 1.25, textTransform: "uppercase",
  },
  title: {
    margin: 0, fontSize: "clamp(38px, 7vw, 58px)", lineHeight: 0.98,
    letterSpacing: -1.8,
    background: "linear-gradient(95deg, #ffcf57 0%, #d89a20 42%, #f8ead0 94%)",
    WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
    textShadow: "0 0 26px rgba(223, 164, 42, 0.09)",
  },
  subtitle: { margin: "14px 0 0", color: "#b7bab7", fontSize: 17, fontWeight: 500 },
  logoFrame: {
    width: 132, height: 132, flexShrink: 0, padding: 0, overflow: "hidden",
    border: "1px solid rgba(213, 167, 75, 0.66)", borderRadius: 28,
    background: "linear-gradient(145deg, rgba(17, 73, 47, .28), rgba(2, 8, 7, .96))",
    boxShadow: "0 20px 50px rgba(0,0,0,.38), 0 0 28px rgba(206,151,44,.08)",
  },
  brandLogo: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  liveBadge: { display: "none" }, liveDot: { display: "none" },
  performanceTopCard: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 8, minHeight: 160, marginBottom: 24, padding: "22px",
    border: "1px solid rgba(200, 151, 56, 0.72)", borderRadius: 21,
    background: "radial-gradient(circle at 50% 18%, rgba(25, 119, 68, .16), transparent 54%), linear-gradient(135deg, rgba(4, 31, 23, .84), rgba(2, 11, 10, .95))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.025), 0 22px 55px rgba(0,0,0,.28)", textAlign: "center",
  },
  performanceTopLabel: { color: "#5fc847", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: .75 },
  performanceTopValue: { fontSize: "clamp(34px, 7vw, 48px)", lineHeight: 1.05, textShadow: "0 0 22px rgba(77, 211, 54, .22)" },
  performanceTopDescription: { color: "#c0c3c0", fontSize: 14, fontWeight: 550 },
  addSection: {
    position: "relative", padding: 24, marginBottom: 18,
    border: "1px solid rgba(97, 105, 100, .48)", borderRadius: 21,
    background: "linear-gradient(145deg, rgba(5, 17, 15, .98), rgba(3, 11, 10, .96))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.018), 0 22px 60px rgba(0,0,0,.27)",
  },
  sectionHeading: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18 },
  sectionTitleRow: { display: "flex", alignItems: "center", gap: 15 },
  addIcon: {
    width: 43, height: 43, display: "grid", placeItems: "center", flexShrink: 0,
    border: "2px solid #58c83e", borderRadius: "50%", color: "#5ed446", fontSize: 31,
    fontWeight: 500, lineHeight: 1, boxShadow: "0 0 18px rgba(75, 208, 51, .11)",
  },
  sectionTitle: { margin: 0, fontSize: 23, color: "#f2d493", letterSpacing: -.25 },
  sectionDescription: { margin: "5px 0 0", color: "#a7aaa7", fontSize: 14 },
  searchWrapper: { position: "relative", zIndex: 20 },
  label: { display: "block", marginBottom: 8, color: "#55c33d", fontSize: 13, fontWeight: 900 },
  input: {
    width: "100%", boxSizing: "border-box", padding: "16px 17px",
    border: "1px solid rgba(78, 92, 84, .56)", borderRadius: 12, outline: "none",
    background: "rgba(1, 8, 7, .95)", color: "#f3f5f2", fontSize: 16,
    boxShadow: "inset 0 0 0 1px rgba(191,145,58,.025)", transition: "all .2s ease",
  },
  searchStatus: { marginTop: 8, color: "#9aa19c", fontSize: 13 },
  resultsBox: {
    position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, maxHeight: 390,
    overflowY: "auto", padding: 7, border: "1px solid rgba(88, 200, 62, .35)",
    borderRadius: 14, background: "#03100d", boxShadow: "0 25px 70px rgba(0,0,0,.68)",
  },
  resultButton: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 11, border: "none", borderRadius: 10, background: "transparent", color: "#f8faf8", cursor: "pointer", textAlign: "left" },
  resultLogo: { width: 38, height: 38, borderRadius: "50%" },
  resultText: { minWidth: 0, display: "flex", flexDirection: "column", gap: 3, flex: 1 },
  resultName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15 },
  resultSymbol: { color: "#6fcf58", fontSize: 12, fontWeight: 800 },
  rank: { color: "#778079", fontSize: 12, whiteSpace: "nowrap" },
  selectedToken: { display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: 13, border: "1px solid rgba(86, 198, 63, .45)", borderRadius: 13, background: "rgba(29, 112, 56, .13)" },
  selectedLogo: { width: 42, height: 42, borderRadius: "50%" },
  selectedName: { display: "block", fontSize: 16 },
  selectedSymbol: { display: "block", marginTop: 3, color: "#75cf63", fontSize: 12 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginTop: 17 },
  addButton: {
    width: "100%", marginTop: 18, padding: "16px 20px", border: "1px solid rgba(104, 234, 68, .55)",
    borderRadius: 12, background: "linear-gradient(180deg, #51d53c 0%, #21aa24 52%, #178d1f 100%)",
    color: "#031006", fontSize: 17, fontWeight: 950,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.22), 0 13px 32px rgba(35, 175, 39, .17)", cursor: "pointer",
  },
  message: { marginBottom: 18, padding: "13px 16px", border: "1px solid rgba(84, 199, 61, .36)", borderRadius: 13, background: "rgba(28, 104, 51, .19)", color: "#bdecb3", fontSize: 14, fontWeight: 700 },
  portfolioSection: { marginTop: 24 },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 },
  cryptoCard: { padding: 19, border: "1px solid rgba(76, 89, 81, .55)", borderRadius: 18, background: "linear-gradient(145deg, rgba(4,18,14,.97), rgba(2,10,8,.97))", boxShadow: "0 18px 45px rgba(0,0,0,.25)" },
  cardHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  tokenIdentity: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  tokenLogo: { width: 48, height: 48, borderRadius: "50%", border: "1px solid rgba(214,166,68,.25)" },
  logoPlaceholder: { width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: "50%", background: "#10271d", color: "#e5bd61", fontSize: 20, fontWeight: 900 },
  cardTitle: { margin: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: 20, whiteSpace: "nowrap", color: "#f1d18a" },
  cardSymbol: { display: "block", marginTop: 4, color: "#77827b", fontSize: 12, fontWeight: 900, textTransform: "uppercase" },
  changeBadge: { flexShrink: 0, padding: "7px 9px", borderRadius: 9, fontSize: 12, fontWeight: 900 },
  priceBlock: { display: "flex", flexDirection: "column", gap: 5, margin: "20px 0" },
  priceLabel: { color: "#8e9891", fontSize: 12, fontWeight: 700 },
  currentPrice: { fontSize: 26, color: "#f5f6f4" },
  dataRows: { display: "flex", flexDirection: "column", gap: 10 },
  line: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  lineLabel: { color: "#929a95", fontSize: 14 },
  lineValue: { color: "#e0e5e1", fontSize: 14, textAlign: "right" },
  profitBox: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginTop: 17, paddingTop: 16, borderTop: "1px solid rgba(78,91,83,.5)" },
  profitLabel: { display: "block", marginBottom: 5, color: "#8e9891", fontSize: 12 },
  profitValue: { display: "block", fontSize: 20 }, performance: { fontSize: 17 },
  cardActions: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 9, marginTop: 17 },
  editButton: { padding: "12px 13px", border: "1px solid rgba(87,199,63,.58)", borderRadius: 10, background: "rgba(38,117,53,.15)", color: "#81dc6d", fontWeight: 800, cursor: "pointer" },
  sellButton: { padding: "12px 13px", border: "1px solid rgba(251,113,133,.48)", borderRadius: 10, background: "rgba(190,24,93,.10)", color: "#fda4af", fontWeight: 800, cursor: "pointer" },
  historyButton: { padding: "12px 13px", border: "1px solid rgba(213,167,75,.45)", borderRadius: 10, background: "rgba(146,102,24,.10)", color: "#efd08a", fontWeight: 800, cursor: "pointer" },
  deleteButton: { padding: "12px 13px", border: "1px solid rgba(239,68,68,.4)", borderRadius: 10, background: "rgba(239,68,68,.09)", color: "#fda4af", fontWeight: 800, cursor: "pointer" },
  emptyState: { padding: "50px 20px", border: "1px dashed rgba(87,104,94,.62)", borderRadius: 18, background: "rgba(4,18,14,.55)", textAlign: "center" },
  emptyIcon: { width: 58, height: 58, display: "grid", placeItems: "center", margin: "0 auto 14px", borderRadius: "50%", background: "#10271d", color: "#dba93e", fontSize: 28, fontWeight: 900 },
  emptyTitle: { margin: 0, fontSize: 20, color: "#f1d18a" },
  emptyText: { maxWidth: 430, margin: "9px auto 0", color: "#929a95", fontSize: 14, lineHeight: 1.6 },
  bottomSummarySection: { marginTop: 28, padding: 22, border: "1px solid rgba(79,92,84,.55)", borderRadius: 20, background: "linear-gradient(145deg, rgba(4,18,14,.98), rgba(2,10,8,.98))", boxShadow: "0 22px 60px rgba(0,0,0,.24)" },
  bottomSummaryHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 },
  visibilityButton: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0, padding: "10px 14px", border: "1px solid rgba(88,200,62,.36)", borderRadius: 999, background: "#0b2117", color: "#b9e9b0", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  visibilityIcon: { fontSize: 16, lineHeight: 1 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 },
  summaryCard: { display: "flex", flexDirection: "column", gap: 8, padding: 20, border: "1px solid rgba(76,89,81,.54)", borderRadius: 18, background: "rgba(3,15,11,.88)", boxShadow: "0 18px 45px rgba(0,0,0,.18)" },
  summaryLabel: { color: "#8e9891", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: .7 },
  summaryValue: { color: "#f3d58e", fontSize: 26 }, summarySecondary: { color: "#728078", fontSize: 14, fontWeight: 700 },
  euroSection: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginTop: 22, padding: 22, border: "1px solid rgba(76,89,81,.5)", borderRadius: 18, background: "rgba(2,12,9,.8)" },
  euroLabel: { color: "#929a95", fontSize: 13, fontWeight: 700 }, euroValue: { margin: "7px 0 0", fontSize: 27 }, exchangeRate: { margin: "6px 0 0", color: "#6f7c74", fontSize: 12 }, euroProfit: { textAlign: "right" }, euroProfitValue: { display: "block", marginTop: 7, fontSize: 22 },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,6,4,.86)", backdropFilter: "blur(9px)" },
  modal: { width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", padding: 22, border: "1px solid rgba(197,148,54,.48)", borderRadius: 20, background: "#04100d", boxShadow: "0 30px 90px rgba(0,0,0,.72)" },
  modalHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 },
  modalEyebrow: { margin: "0 0 4px", color: "#59c941", fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" },
  modalTitle: { margin: 0, fontSize: 25, color: "#efd08a" },
  closeButton: { width: 38, height: 38, border: "1px solid rgba(82,99,89,.58)", borderRadius: 10, background: "#0c2218", color: "#f8faf8", fontSize: 25, lineHeight: 1, cursor: "pointer" },
  transactionTabs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 },
  transactionTab: { padding: "11px 14px", border: "1px solid rgba(78,91,83,.55)", borderRadius: 10, background: "#071813", color: "#9aa49d", fontWeight: 900, cursor: "pointer" },
  transactionTabActive: { borderColor: "rgba(74,222,128,.60)", background: "rgba(34,197,94,.13)", color: "#86efac" },
  transactionTabSaleActive: { borderColor: "rgba(251,113,133,.60)", background: "rgba(244,63,94,.12)", color: "#fda4af" },
  currentPositionBox: { display: "flex", flexDirection: "column", gap: 10, padding: 14, border: "1px solid rgba(77,91,82,.5)", borderRadius: 12, background: "#061712" },
  saleInformationBox: { marginTop: 17, padding: "12px 14px", border: "1px solid rgba(251,113,133,.32)", borderRadius: 12, background: "rgba(190,24,93,.07)", color: "#fecdd3", fontSize: 13, fontWeight: 700, lineHeight: 1.5 },
  modalFields: { display: "grid", gap: 14, marginTop: 17 },
  previewBox: { display: "flex", flexDirection: "column", gap: 5, marginTop: 17, padding: 14, border: "1px solid rgba(74,222,128,.4)", borderRadius: 12, background: "rgba(34,197,94,.08)" },
  previewLabel: { color: "#86efac", fontSize: 12, fontWeight: 700 }, previewValue: { color: "#4ade80", fontSize: 22 }, previewHint: { color: "#9aa49d", fontSize: 12, lineHeight: 1.45 },
  purchaseMessage: { marginTop: 16, padding: "12px 14px", border: "1px solid rgba(251,113,133,.45)", borderRadius: 11, background: "rgba(190,24,93,.10)", color: "#fecdd3", fontSize: 13, fontWeight: 700, lineHeight: 1.45 },
  modalActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 },
  cancelButton: { padding: "14px 16px", border: "1px solid rgba(80,97,87,.58)", borderRadius: 11, background: "#0c2218", color: "#dce4de", fontWeight: 800, cursor: "pointer" },
  confirmButton: { padding: "14px 16px", border: "none", borderRadius: 11, background: "linear-gradient(180deg,#51d53c,#1d9d23)", color: "#031006", fontWeight: 900, cursor: "pointer" },
  confirmSaleButton: { background: "linear-gradient(180deg,#fb7185,#be123c)", color: "#fff1f2" },
  historyList: { display: "flex", flexDirection: "column", gap: 12 },
  historyItem: { padding: 15, border: "1px solid rgba(77,91,82,.52)", borderRadius: 13, background: "#061712" },
  historyTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  historyType: { padding: "6px 9px", borderRadius: 999, fontSize: 12, fontWeight: 900 },
  historyDate: { color: "#89938c", fontSize: 12, textAlign: "right" },
  historyDetails: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, color: "#aeb6b0", fontSize: 13, lineHeight: 1.45 },
  historyEmpty: { padding: "28px 18px", border: "1px dashed rgba(77,91,82,.62)", borderRadius: 13, color: "#9aa49d", textAlign: "center", lineHeight: 1.6 },
  undoButton: { width: "100%", marginTop: 13, padding: "10px 12px", border: "1px solid rgba(251,191,36,.42)", borderRadius: 9, background: "rgba(180,113,10,.10)", color: "#f5d58d", fontWeight: 800 },
};