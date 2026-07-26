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
  const [additionalPurchase, setAdditionalPurchase] = useState({
    quantity: "",
    buyPrice: "",
  });

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

    if (!quantity || quantity <= 0) {
      setMessage("Entre une quantité supérieure à zéro.");
      return;
    }

    if (!buyPrice || buyPrice <= 0) {
      setMessage("Entre un prix d’achat supérieur à zéro.");
      return;
    }

    setIsAdding(true);
    setMessage("");

    const existingAsset = assets.find(
      (asset) => asset.id === selectedToken.id
    );

    if (existingAsset) {
      const oldInvestment =
        existingAsset.quantity * existingAsset.buyPrice;

      const newInvestment = quantity * buyPrice;
      const totalQuantity = existingAsset.quantity + quantity;

      const weightedAveragePrice =
        totalQuantity > 0
          ? (oldInvestment + newInvestment) / totalQuantity
          : 0;

      const { error } = await supabase
        .from("portfolios")
        .update({
          quantite: totalQuantity,
          prix_achat: weightedAveragePrice,
        })
        .eq("id", existingAsset.dbId);

      if (error) {
        console.error("Erreur mise à jour :", error);
        setMessage("Erreur pendant la mise à jour de la position.");
        setIsAdding(false);
        return;
      }

      setMessage(
        `${selectedToken.name} a été mis à jour avec le nouveau prix moyen.`
      );
    } else {
      const { error } = await supabase.from("portfolios").insert([
        {
          crypto: selectedToken.id,
          quantite: quantity,
          prix_achat: buyPrice,
        },
      ]);

      if (error) {
        console.error("Erreur ajout :", error);
        setMessage("Erreur pendant l’ajout de la crypto.");
        setIsAdding(false);
        return;
      }

      setMessage(`${selectedToken.name} a été ajouté au portefeuille.`);
    }

    resetForm();
    await loadAssets();
    setIsAdding(false);
  }

  function openPurchaseForm(asset) {
    setEditingAsset(asset);
    setAdditionalPurchase({
      quantity: "",
      buyPrice: "",
    });
    setMessage("");
  }

  function closePurchaseForm() {
    setEditingAsset(null);
    setAdditionalPurchase({
      quantity: "",
      buyPrice: "",
    });
  }

  async function addAdditionalPurchase() {
    if (!editingAsset) {
      return;
    }

    const newQuantity = Number(additionalPurchase.quantity);
    const newBuyPrice = Number(additionalPurchase.buyPrice);

    if (!newQuantity || newQuantity <= 0) {
      setMessage("Entre une nouvelle quantité supérieure à zéro.");
      return;
    }

    if (!newBuyPrice || newBuyPrice <= 0) {
      setMessage("Entre le prix du nouvel achat.");
      return;
    }

    const oldInvestment =
      editingAsset.quantity * editingAsset.buyPrice;

    const newInvestment = newQuantity * newBuyPrice;
    const totalQuantity = editingAsset.quantity + newQuantity;

    const weightedAveragePrice =
      totalQuantity > 0
        ? (oldInvestment + newInvestment) / totalQuantity
        : 0;

    const { error } = await supabase
      .from("portfolios")
      .update({
        quantite: totalQuantity,
        prix_achat: weightedAveragePrice,
      })
      .eq("id", editingAsset.dbId);

    if (error) {
      console.error("Erreur nouvel achat :", error);
      setMessage("Impossible d’enregistrer le nouvel achat.");
      return;
    }

    setMessage(
      `Nouvel achat enregistré pour ${editingAsset.name}. Prix moyen recalculé.`
    );

    closePurchaseForm();
    await loadAssets();
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

  function formatUSD(value) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
                  >
                    <div style={styles.cardHeader}>
                      <div style={styles.tokenIdentity}>
                        {asset.image ? (
                          <img
                            src={asset.image}
                            alt=""
                            style={styles.tokenLogo}
                          />
                        ) : (
                          <div style={styles.logoPlaceholder}>
                            {asset.name
                              ?.slice(0, 1)
                              .toUpperCase()}
                          </div>
                        )}

                        <div>
                          <h3 style={styles.cardTitle}>
                            {asset.name}
                          </h3>

                          <span style={styles.cardSymbol}>
                            {asset.symbol || asset.id}
                          </span>
                        </div>
                      </div>

                      <div
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

                    <div style={styles.priceBlock}>
                      <span style={styles.priceLabel}>
                        Prix actuel
                      </span>

                      <strong style={styles.currentPrice}>
                        {formatUSD(asset.currentPrice)}
                      </strong>
                    </div>

                    <div style={styles.dataRows}>
                      <div style={styles.line}>
                        <span style={styles.lineLabel}>
                          Quantité
                        </span>

                        <strong style={styles.lineValue}>
                          {formatNumber(asset.quantity)}
                        </strong>
                      </div>

                      <div style={styles.line}>
                        <span style={styles.lineLabel}>
                          Prix moyen
                        </span>

                        <strong style={styles.lineValue}>
                          {formatUSD(asset.buyPrice)}
                        </strong>
                      </div>

                      <div style={styles.line}>
                        <span style={styles.lineLabel}>
                          Montant investi
                        </span>

                        <strong style={styles.lineValue}>
                          {formatUSD(investedValue)}
                        </strong>
                      </div>

                      <div style={styles.line}>
                        <span style={styles.lineLabel}>
                          Valeur actuelle
                        </span>

                        <strong style={styles.lineValue}>
                          {formatUSD(currentValue)}
                        </strong>
                      </div>
                    </div>

                    <div style={styles.profitBox}>
                      <div>
                        <span style={styles.profitLabel}>
                          Résultat
                        </span>

                        <strong
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

                    <div style={styles.cardActions}>
                      <button
                        type="button"
                        style={styles.editButton}
                        onClick={() =>
                          openPurchaseForm(asset)
                        }
                      >
                        Modifier / Nouvel achat
                      </button>

                      <button
                        type="button"
                        style={styles.deleteButton}
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

                <h2 style={styles.modalTitle}>
                  {editingAsset.name}
                </h2>
              </div>

              <button
                type="button"
                style={styles.closeButton}
                onClick={closePurchaseForm}
              >
                ×
              </button>
            </div>

            <div style={styles.currentPositionBox}>
              <div style={styles.line}>
                <span style={styles.lineLabel}>
                  Quantité actuelle
                </span>

                <strong style={styles.lineValue}>
                  {formatNumber(editingAsset.quantity)}
                </strong>
              </div>

              <div style={styles.line}>
                <span style={styles.lineLabel}>
                  Prix moyen actuel
                </span>

                <strong style={styles.lineValue}>
                  {formatUSD(editingAsset.buyPrice)}
                </strong>
              </div>
            </div>

            <div style={styles.modalFields}>
              <div>
                <label style={styles.label}>
                  Quantité supplémentaire
                </label>

                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Nouvelle quantité"
                  value={additionalPurchase.quantity}
                  onChange={(event) =>
                    setAdditionalPurchase({
                      ...additionalPurchase,
                      quantity: event.target.value,
                    })
                  }
                />
              </div>

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
                  value={additionalPurchase.buyPrice}
                  onChange={(event) =>
                    setAdditionalPurchase({
                      ...additionalPurchase,
                      buyPrice: event.target.value,
                    })
                  }
                />
              </div>
            </div>

            {Number(additionalPurchase.quantity) > 0 &&
              Number(additionalPurchase.buyPrice) > 0 && (
                <div style={styles.previewBox}>
                  <span style={styles.previewLabel}>
                    Nouveau prix moyen estimé
                  </span>

                  <strong style={styles.previewValue}>
                    {formatUSD(
                      (editingAsset.quantity *
                        editingAsset.buyPrice +
                        Number(
                          additionalPurchase.quantity
                        ) *
                          Number(
                            additionalPurchase.buyPrice
                          )) /
                        (editingAsset.quantity +
                          Number(
                            additionalPurchase.quantity
                          ))
                    )}
                  </strong>
                </div>
              )}

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={closePurchaseForm}
              >
                Annuler
              </button>

              <button
                type="button"
                style={styles.confirmButton}
                onClick={addAdditionalPurchase}
              >
                Enregistrer l’achat
              </button>
            </div>
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
  }
  @media (max-width: 500px) {
    .ld-header { align-items: flex-start !important; }
    .ld-header > div:last-child { width: 82px !important; height: 82px !important; border-radius: 18px !important; }
    .ld-header h1 { font-size: 36px !important; }
    .ld-header p:first-child { font-size: 11px !important; }
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
  cardActions: { display: "grid", gridTemplateColumns: "1fr auto", gap: 9, marginTop: 17 },
  editButton: { padding: "12px 13px", border: "1px solid rgba(87,199,63,.58)", borderRadius: 10, background: "rgba(38,117,53,.15)", color: "#81dc6d", fontWeight: 800, cursor: "pointer" },
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
  currentPositionBox: { display: "flex", flexDirection: "column", gap: 10, padding: 14, border: "1px solid rgba(77,91,82,.5)", borderRadius: 12, background: "#061712" },
  modalFields: { display: "grid", gap: 14, marginTop: 17 },
  previewBox: { display: "flex", flexDirection: "column", gap: 5, marginTop: 17, padding: 14, border: "1px solid rgba(74,222,128,.4)", borderRadius: 12, background: "rgba(34,197,94,.08)" },
  previewLabel: { color: "#86efac", fontSize: 12, fontWeight: 700 }, previewValue: { color: "#4ade80", fontSize: 22 },
  modalActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 },
  cancelButton: { padding: "14px 16px", border: "1px solid rgba(80,97,87,.58)", borderRadius: 11, background: "#0c2218", color: "#dce4de", fontWeight: 800, cursor: "pointer" },
  confirmButton: { padding: "14px 16px", border: "none", borderRadius: 11, background: "linear-gradient(180deg,#51d53c,#1d9d23)", color: "#031006", fontWeight: 900, cursor: "pointer" },
};