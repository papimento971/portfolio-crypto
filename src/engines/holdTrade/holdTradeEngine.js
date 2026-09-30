export function runHoldTradeEngine(input) {
  if (!input || typeof input !== "object") {
    return createInvalidResult(
      "Entrée HOLD/TRADE absente ou invalide."
    );
  }

  const position = normalizePosition(
    input.position
  );

  if (!position) {
    return createInvalidResult(
      "Les données de position sont absentes ou invalides."
    );
  }

  const missingData = [];

  if (!position.tokenId) {
    missingData.push("tokenId");
  }

  if (!position.symbol) {
    missingData.push("symbol");
  }

  if (
    position.mode !== "hold" &&
    position.mode !== "trade"
  ) {
    missingData.push("mode");
  }

  if (position.quantity === null) {
    missingData.push("quantity");
  }

  if (position.averagePrice === null) {
    missingData.push("averagePrice");
  }

  if (position.currentPrice === null) {
    missingData.push("currentPrice");
  }

  const coverage = calculateCoverage(
    6,
    missingData.length
  );

  if (missingData.length > 0) {
    return {
      status: "insufficient_data",

      mode: position.mode,

      anticipation: null,

      risk: null,

      levels: createEmptyLevels(),

      actions: [],

      recommendedPlan: null,

      planB: null,

      dataQuality: {
        coverage,
        missingData,
      },
    };
  }
const positionMetrics =
  calculatePositionMetrics(position);

const market =
  normalizeObject(input.market);

  const positionState =
  calculatePositionState(
    positionMetrics
  );
const anticipation =
  calculateAnticipation(
    position,
    positionMetrics,
    positionState,
    market
  );
  const strategyContext =
  position.mode === "hold"
    ? "long_term"
    : "short_term";
  return {
    status: "ready",

    mode: position.mode,

    positionMetrics,

    positionState,

    anticipation,

    risk: null,

    levels: createEmptyLevels(),

    actions: [],

    recommendedPlan: null,

    planB: null,

    dataQuality: {
      coverage: 100,
      missingData: [],
    },

    normalizedInput: {
      position,

      market: normalizeObject(
        input.market
      ),

      intelligence: normalizeObject(
        input.intelligence
      ),

      execution: normalizeObject(
        input.execution
      ),
    },
  };
}
function calculatePositionState(
  positionMetrics
) {
  const performance =
    positionMetrics.unrealizedPnlPercent;

  let state = "neutral";

  if (performance > 0) {
    state = "profit";
  }

  if (performance < 0) {
    state = "loss";
  }

  return {
    state,
    performancePercent: performance,
  };
}
function calculateAnticipation(
  position,
  positionMetrics,
  positionState,
  market
) {
  let priceVsAverageState = "at_average";

if (
  positionMetrics.priceVsAveragePercent > 0
) {
  priceVsAverageState = "above_average";
}

const strategyContext =
  position.mode === "hold"
    ? "long_term"
    : "short_term";

if (
  positionMetrics.priceVsAveragePercent < 0
) {
  priceVsAverageState = "below_average";
}

  return {
    mode: position.mode,
    strategyContext,
    state: positionState.state,
    performancePercent:
      positionMetrics.unrealizedPnlPercent,
    scenario: null,
    confidence: null,
   factors: [
  {
    type: "price_vs_average",
    state: priceVsAverageState,
    valuePercent:
      positionMetrics.priceVsAveragePercent,
  },
],
  };
}
function normalizePosition(position) {
  if (
    !position ||
    typeof position !== "object" ||
    Array.isArray(position)
  ) {
    return null;
  }

  return {
    tokenId: normalizeText(
      position.tokenId
    ),

    symbol: normalizeText(
      position.symbol
    ),

    name: normalizeText(
      position.name
    ),

    mode: normalizeMode(
      position.mode
    ),

    quantity: normalizeNumber(
      position.quantity
    ),

    averagePrice: normalizeNumber(
      position.averagePrice
    ),

    currentPrice: normalizeNumber(
      position.currentPrice
    ),

    positionValueUsd: normalizeNumber(
      position.positionValueUsd
    ),

    investedValueUsd: normalizeNumber(
      position.investedValueUsd
    ),

    unrealizedPnlUsd: normalizeNumber(
      position.unrealizedPnlUsd
    ),

    unrealizedPnlPercent:
      normalizeNumber(
        position.unrealizedPnlPercent
      ),

    availableUsdc: normalizeNumber(
      position.availableUsdc
    ),

    realizedGainsUsd: normalizeNumber(
      position.realizedGainsUsd
    ),
  };
}
function calculatePositionMetrics(position) {
  const positionValueUsd =
    position.quantity *
    position.currentPrice;

  const investedValueUsd =
    position.quantity *
    position.averagePrice;

  const unrealizedPnlUsd =
    positionValueUsd -
    investedValueUsd;

  const unrealizedPnlPercent =
    investedValueUsd > 0
      ? (unrealizedPnlUsd /
          investedValueUsd) *
        100
      : 0;

  const priceVsAveragePercent =
    position.averagePrice > 0
      ? ((position.currentPrice -
          position.averagePrice) /
          position.averagePrice) *
        100
      : 0;

  return {
    positionValueUsd,
    investedValueUsd,
    unrealizedPnlUsd,
    unrealizedPnlPercent,
    priceVsAveragePercent,
  };
}
function normalizeObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function normalizeMode(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    normalized !== "hold" &&
    normalized !== "trade"
  ) {
    return null;
  }

  return normalized;
}

function normalizeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const normalized = Number(value);

  return Number.isFinite(normalized)
    ? normalized
    : null;
}

function calculateCoverage(
  totalRequiredFields,
  missingFieldCount
) {
  if (totalRequiredFields <= 0) {
    return 0;
  }

  const availableFields =
    totalRequiredFields -
    missingFieldCount;

  return Math.round(
    (availableFields /
      totalRequiredFields) *
      100
  );
}

function createEmptyLevels() {
  return {
    support1: null,
    support2: null,
    resistance1: null,
    resistance2: null,
  };
}

function createInvalidResult(reason) {
  return {
    status: "invalid_input",

    mode: null,

    anticipation: null,

    risk: null,

    levels: createEmptyLevels(),

    actions: [],

    recommendedPlan: null,

    planB: null,

    dataQuality: {
      coverage: 0,
      missingData: [],
    },

    error: reason,
  };
}