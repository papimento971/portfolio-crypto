import { runHoldTradeEngine } from "./holdTradeEngine.js";

const testPosition = {
  position: {
    tokenId: "chainlink",
    symbol: "LINK",
    name: "Chainlink",
    mode: "hold",

    quantity: 296.4676259,
    averagePrice: 8.31,
    currentPrice: 12,

    positionValueUsd: 3557.61,
    investedValueUsd: 2463.65,

    unrealizedPnlUsd: 1093.96,
    unrealizedPnlPercent: 44.4,

    availableUsdc: 0,
    realizedGainsUsd: 0,
  },

  market: {},
  intelligence: {},
  execution: {},
};

const result =
  runHoldTradeEngine(testPosition);

console.log(
  "TEST HOLD/TRADE ENGINE"
);

console.log(
  JSON.stringify(result, null, 2)
);