const VERSION = "6.2.0";
const BUILD_TIME = "2026-06-28";

const METRICS = [
  { key: "pePct", label: "PE历史分位", unit: "%", weight: 10, module: "估值", tolerance: 8, maxAgeDays: 10 },
  { key: "pbPct", label: "PB历史分位", unit: "%", weight: 7, module: "估值", tolerance: 8, maxAgeDays: 10 },
  { key: "dividendYieldPct", label: "股息率历史分位", unit: "%", weight: 5, module: "估值", tolerance: 10, maxAgeDays: 10 },
  { key: "erp", label: "股权风险溢价 ERP", unit: "%", weight: 8, module: "估值", tolerance: 0.6, maxAgeDays: 10 },
  { key: "marginFloat", label: "两融余额/流通市值", unit: "%", weight: 9, module: "杠杆", tolerance: 0.5, maxAgeDays: 7 },
  { key: "marginBuy", label: "融资买入额/成交额", unit: "%", weight: 8, module: "杠杆", tolerance: 1.2, maxAgeDays: 7 },
  { key: "leverageYoy", label: "两融余额同比增速", unit: "%", weight: 8, module: "杠杆", tolerance: 8, maxAgeDays: 7 },
  { key: "yield3m", label: "10年国债收益率3个月变化", unit: "bp", weight: 7, module: "流动性", tolerance: 15, maxAgeDays: 7 },
  { key: "creditTrend", label: "社融/信用趋势变化", unit: "pt", weight: 8, module: "流动性", tolerance: 0.8, maxAgeDays: 45 },
  { key: "policy", label: "政策/监管状态", unit: "档", weight: 5, module: "流动性", tolerance: 1, maxAgeDays: 30 },
  { key: "fundFlowPct", label: "ETF份额/资金流热度", unit: "%", weight: 8, module: "情绪", tolerance: 10, maxAgeDays: 7 },
  { key: "epsRevision", label: "3个月盈利预测修正", unit: "%", weight: 10, module: "盈利", tolerance: 3, maxAgeDays: 45 },
];

const STATIC_FILL_PROFILES = {
  宽基: { pePct: 50, pbPct: 48, dividendYieldPct: 56, erp: 4.0, marginFloat: 2.5, marginBuy: 7.5, leverageYoy: 18, yield3m: 15, creditTrend: -0.3, policy: 1, fundFlowPct: 50, epsRevision: 0.8 },
  科技: { pePct: 58, pbPct: 54, dividendYieldPct: 38, erp: 3.0, marginFloat: 3.6, marginBuy: 10.2, leverageYoy: 38, yield3m: 18, creditTrend: 0.1, policy: 2, fundFlowPct: 62, epsRevision: -1.8 },
  主题: { pePct: 56, pbPct: 52, dividendYieldPct: 34, erp: 3.2, marginFloat: 3.2, marginBuy: 9.2, leverageYoy: 30, yield3m: 16, creditTrend: -0.1, policy: 2, fundFlowPct: 54, epsRevision: -1.0 },
  QDII: { pePct: 70, pbPct: 62, dividendYieldPct: 42, erp: 2.7, marginFloat: 1.8, marginBuy: 5.8, leverageYoy: 12, yield3m: 20, creditTrend: -0.5, policy: 1, fundFlowPct: 54, epsRevision: 0.2 },
  商品: { pePct: 50, pbPct: 50, dividendYieldPct: 50, erp: 3.0, marginFloat: 1.2, marginBuy: 4.5, leverageYoy: 8, yield3m: 18, creditTrend: -0.2, policy: 1, fundFlowPct: 50, epsRevision: 0 },
  策略: { pePct: 48, pbPct: 44, dividendYieldPct: 72, erp: 3.8, marginFloat: 1.8, marginBuy: 5.5, leverageYoy: 10, yield3m: 12, creditTrend: -0.2, policy: 1, fundFlowPct: 48, epsRevision: 0.5 },
};

const DEFAULT_FILL_PROFILE = STATIC_FILL_PROFILES.宽基;
const PERCENTILE_METRICS = new Set(["pePct", "pbPct", "dividendYieldPct", "fundFlowPct"]);

const state = {
  assets: [],
  filteredAssets: [],
  selectedAssetId: 0,
  selectedMetricKey: "pePct",
  selectedCategory: "全部",
  activeView: "indices",
};

function pctRisk(value) {
  if (value < 50) return Math.round(value * 0.4);
  if (value < 70) return Math.round(20 + (value - 50) * 1.0);
  if (value < 85) return Math.round(40 + (value - 70) * 1.35);
  if (value < 95) return Math.round(60 + (value - 85) * 2.5);
  return Math.min(100, Math.round(85 + (value - 95) * 3));
}

function inversePctRisk(value) {
  return Math.max(0, Math.min(100, 100 - pctRisk(value)));
}

function erpRisk(value) {
  if (value >= 5) return 10;
  if (value >= 3.5) return Math.round(20 + (5 - value) * 10);
  if (value >= 2) return Math.round(40 + (3.5 - value) * 16);
  if (value >= 1) return Math.round(70 + (2 - value) * 15);
  return 95;
}

function creditRisk(value) {
  if (value >= 2) return 10;
  if (value >= 0) return Math.round(25 + (2 - value) * 7);
  if (value >= -2) return Math.round(45 + (0 - value) * 10);
  if (value >= -4) return Math.round(70 + (-2 - value) * 8);
  return 92;
}

function epsRisk(value) {
  if (value >= 5) return 10;
  if (value >= 0) return Math.round(25 + (5 - value) * 3);
  if (value >= -5) return Math.round(45 + (0 - value) * 5);
  if (value >= -15) return Math.round(70 + (-5 - value) * 2);
  return 95;
}

function pieceRisk(value, breaks) {
  for (const [limit, score] of breaks) {
    if (value < limit) return score;
  }
  return breaks[breaks.length - 1][1];
}

function scoreMetric(value, key) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const funcs = {
    pePct: pctRisk,
    pbPct: pctRisk,
    dividendYieldPct: inversePctRisk,
    erp: erpRisk,
    creditTrend: creditRisk,
    epsRevision: epsRisk,
    marginFloat: value => pieceRisk(value, [[2, 15], [3, 35], [4, 60], [5, 80], [999, 95]]),
    marginBuy: value => pieceRisk(value, [[6, 15], [9, 35], [12, 60], [15, 80], [999, 95]]),
    leverageYoy: value => pieceRisk(value, [[0, 15], [20, 35], [50, 65], [100, 85], [999, 95]]),
    yield3m: value => pieceRisk(value, [[-30, 10], [0, 25], [50, 60], [100, 82], [999, 95]]),
    policy: value => [10, 30, 55, 80, 95][Math.min(4, Math.max(0, Math.floor(value)))] || 30,
    fundFlowPct: pctRisk,
  };
  return funcs[key] ? funcs[key](value) : null;
}

function safeNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function freshnessDays(timestamp) {
  const date = parseDate(timestamp);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function confidenceAfterFreshness(confidence, days, maxAge) {
  if (days === null) return [Math.max(20, confidence - 8), "unknown"];
  if (days <= maxAge) return [confidence, "fresh"];
  if (days <= maxAge * 3) return [Math.max(30, confidence - 15), "stale"];
  return [Math.max(20, confidence - 35), "very_stale"];
}

function weightedMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((sum, item) => sum + item[1], 0);
  let running = 0;
  for (const [value, weight] of sorted) {
    running += weight;
    if (running >= total / 2) return value;
  }
  return sorted[sorted.length - 1][0];
}

function stableOffset(seed, range = 6) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return (hash % (range * 2 + 1)) - range;
}

function clampMetricValue(metricKey, value) {
  if (["pePct", "pbPct", "dividendYieldPct", "fundFlowPct"].includes(metricKey)) {
    return Math.max(1, Math.min(99, value));
  }
  if (metricKey === "policy") return Math.max(0, Math.min(4, Math.round(value)));
  return Math.round(value * 100) / 100;
}

function filledSources(rawAsset, metric) {
  const manualSources = rawAsset.manual_sources?.[metric.key] || [];
  if (manualSources.length) return manualSources;

  const profile = STATIC_FILL_PROFILES[rawAsset.type] || DEFAULT_FILL_PROFILE;
  const base = profile[metric.key] ?? DEFAULT_FILL_PROFILE[metric.key];
  const value = clampMetricValue(metric.key, base + stableOffset(`${rawAsset.name}-${metric.key}`));
  return [{
    source: `static_fill_${rawAsset.type || "default"}`,
    value,
    confidence: 52,
    timestamp: BUILD_TIME,
    staticFill: true,
    note: "静态版缺项补齐：基于同类资产基准估算，需以后续真实数据替换",
  }];
}

function consensus(metric, sources = []) {
  if (!sources.length) {
    return {
      metric: metric.key,
      value: null,
      confidence: 0,
      status: "missing",
      spread: null,
      sourceCount: 0,
      staleSourceCount: 0,
      sources: [],
      message: "缺失数据",
    };
  }

  const enriched = sources.map(source => {
    const days = freshnessDays(source.timestamp);
    const [adjustedConfidence, freshnessStatus] = confidenceAfterFreshness(
      safeNumber(source.confidence, 50),
      days,
      metric.maxAgeDays || 30
    );
    return {
      ...source,
      value: safeNumber(source.value),
      freshnessDays: days,
      freshnessStatus,
      adjustedConfidence: Math.round(adjustedConfidence),
    };
  }).filter(source => source.value !== null);

  if (!enriched.length) return consensus(metric, []);

  const chosen = weightedMedian(enriched.map(source => [source.value, Math.max(1, source.adjustedConfidence)]));
  const values = enriched.map(source => source.value);
  const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  const avgConfidence = enriched.reduce((sum, source) => sum + source.adjustedConfidence, 0) / enriched.length;
  const tolerance = metric.tolerance || 10;

  let status = "single_external";
  let confidence = Math.min(78, avgConfidence);
  let message = "单一源";

  if (values.length >= 2 && spread <= tolerance) {
    status = "verified";
    confidence = Math.min(96, avgConfidence + 12);
    message = "多源一致";
  } else if (values.length >= 2 && spread <= tolerance * 2) {
    status = "divergent";
    confidence = Math.max(45, avgConfidence - 15);
    message = "多源轻微冲突";
  } else if (values.length >= 2) {
    status = "conflict";
    confidence = Math.max(25, avgConfidence - 35);
    message = "多源严重冲突";
  }

  if (enriched.every(source => source.staticFill)) {
    status = "filled";
    confidence = Math.min(60, confidence);
    message = "静态补齐";
  }

  return {
    metric: metric.key,
    value: Math.round(chosen * 100) / 100,
    confidence: Math.round(confidence),
    status,
    spread: Math.round(spread * 100) / 100,
    sourceCount: enriched.length,
    staleSourceCount: enriched.filter(source => source.freshnessStatus === "stale" || source.freshnessStatus === "very_stale").length,
    sources: enriched,
    message,
  };
}

function calcWeightedScore(metricScores) {
  let availableWeight = 0;
  let weighted = 0;
  let confidenceWeight = 0;
  let weightedConfidence = 0;

  for (const metric of METRICS) {
    const score = metricScores[metric.key];
    if (score === null || score === undefined) continue;
    availableWeight += metric.weight;
    weighted += score * metric.weight;
    const result = metricScores.results[metric.key];
    confidenceWeight += metric.weight;
    weightedConfidence += result.confidence * metric.weight;
  }

  const totalWeight = METRICS.reduce((sum, metric) => sum + metric.weight, 0);
  return {
    score: availableWeight ? Math.round(weighted / availableWeight) : null,
    coverage: Math.round((availableWeight / totalWeight) * 100),
    confidence: confidenceWeight ? Math.round(weightedConfidence / confidenceWeight) : 0,
  };
}

function calcModuleScores(metricScores) {
  const groups = {};
  for (const metric of METRICS) {
    const score = metricScores[metric.key];
    if (score === null || score === undefined) continue;
    groups[metric.module] ||= { weighted: 0, weight: 0 };
    groups[metric.module].weighted += score * metric.weight;
    groups[metric.module].weight += metric.weight;
  }
  return Object.fromEntries(Object.entries(groups).map(([module, item]) => [module, Math.round(item.weighted / item.weight)]));
}

function hardTriggers(values, metricScores, acceleration) {
  const triggers = [];
  if (metricScores.pePct >= 80 && metricScores.pbPct >= 75) triggers.push("PE/PB 同时处在高风险分位");
  if (metricScores.fundFlowPct >= 80) triggers.push("ETF 资金流热度过高");
  if (metricScores.marginFloat >= 80 || metricScores.marginBuy >= 80) triggers.push("杠杆资金指标过热");
  if (metricScores.epsRevision >= 80) triggers.push("盈利预测持续下修");
  if (metricScores.creditTrend >= 80) triggers.push("信用趋势明显收缩");
  if (metricScores.policy >= 80) triggers.push("政策/监管状态偏紧");
  if (acceleration >= 18) triggers.push(`风险分较上期快速上升 ${acceleration} 分`);
  if (values.erp !== null && values.erp < 1.5) triggers.push("股权风险溢价偏低");
  return triggers;
}

function alertLevel(score, hardCount, confidence, conflicts, coverage) {
  if (score === null || coverage < 60 || confidence < 45 || conflicts >= 3) {
    return { level: "复核", className: "purple", action: "暂停建议", rank: 6 };
  }
  if (score >= 80 || hardCount >= 5) return { level: "防守", className: "darkred", action: "高度防守", rank: 5 };
  if (score >= 70 || hardCount >= 3) return { level: "减仓", className: "red", action: "降低暴露", rank: 4 };
  if (score >= 58 || hardCount >= 1) return { level: "预警", className: "orange", action: "收紧仓位", rank: 3 };
  if (score >= 42) return { level: "观察", className: "yellow", action: "保持观察", rank: 2 };
  return { level: "正常", className: "green", action: "常规跟踪", rank: 1 };
}

function targetPosition(assetType, score, hardCount, confidence, conflicts, coverage) {
  if (score === null || coverage < 60 || confidence < 45 || conflicts >= 3) return null;
  const factor = assetType === "宽基" ? 0.72 : assetType === "QDII" ? 0.86 : assetType === "行业" ? 0.95 : 1.08;
  return Math.max(0, Math.min(100, Math.round(100 - score * factor - hardCount * 5)));
}

function calcOpportunity(metricScores, riskScore, confidence, coverage) {
  const required = ["pePct", "pbPct", "dividendYieldPct", "erp", "fundFlowPct", "epsRevision"];
  if (required.some(key => metricScores[key] === null || metricScores[key] === undefined) || riskScore === null || coverage < 60) return null;
  const valuation = 100 - (metricScores.pePct * 0.42 + metricScores.pbPct * 0.25 + metricScores.erp * 0.18 + metricScores.dividendYieldPct * 0.15);
  const sentiment = 100 - metricScores.fundFlowPct;
  const earnings = 100 - metricScores.epsRevision;
  const riskPenalty = Math.max(0, riskScore - 50) * 0.55;
  const confidencePenalty = Math.max(0, 70 - confidence) * 0.2;
  return Math.max(0, Math.min(100, Math.round(valuation * 0.5 + sentiment * 0.2 + earnings * 0.2 + 10 - riskPenalty - confidencePenalty)));
}

function calcAsset(rawAsset, id) {
  const metricResults = {};
  const metricScores = { results: metricResults };
  const values = {};

  for (const metric of METRICS) {
    const result = consensus(metric, filledSources(rawAsset, metric));
    metricResults[metric.key] = result;
    values[metric.key] = result.value;
    metricScores[metric.key] = scoreMetric(result.value, metric.key);
  }

  const weighted = calcWeightedScore(metricScores);
  const prevScore = safeNumber(rawAsset.prevScore, weighted.score);
  const acceleration = weighted.score !== null && prevScore !== null ? weighted.score - prevScore : 0;
  const conflicts = Object.values(metricResults).filter(result => result.status === "conflict").length;
  const missing = Object.values(metricResults).filter(result => result.status === "missing").length;
  const filled = Object.values(metricResults).filter(result => result.status === "filled").length;
  const hard = hardTriggers(values, metricScores, acceleration);
  const alert = alertLevel(weighted.score, hard.length, weighted.confidence, conflicts, weighted.coverage);
  const targetUpper = targetPosition(rawAsset.type || "指数", weighted.score, hard.length, weighted.confidence, conflicts, weighted.coverage);
  const opportunityScore = calcOpportunity(metricScores, weighted.score, weighted.confidence, weighted.coverage);
  const moduleScores = calcModuleScores(metricScores);
  const evidence = buildEvidence(metricScores, metricResults, hard, weighted.coverage);

  return {
    ...rawAsset,
    id,
    riskScore: weighted.score,
    prevScore,
    acceleration,
    values,
    metricScores,
    metricResults,
    moduleScores,
    hardTriggers: hard,
    hardTriggerCount: hard.length,
    dataConfidence: weighted.confidence,
    coveragePct: weighted.coverage,
    conflictCount: conflicts,
    missingCount: missing,
    filledCount: filled,
    alert,
    targetPositionUpper: targetUpper,
    targetPositionDisplay: targetUpper === null ? "暂停建议" : `0%~${targetUpper}%`,
    opportunityScore,
    evidence,
  };
}

function buildEvidence(metricScores, metricResults, hard, coverage) {
  const evidence = hard.map(text => ({ type: "硬触发", text }));
  for (const metric of METRICS) {
    const score = metricScores[metric.key];
    const result = metricResults[metric.key];
    if (result.status === "missing") evidence.push({ type: "数据缺失", text: `${metric.label} 缺失` });
    if (result.status === "filled") evidence.push({ type: "静态补齐", text: `${metric.label} 使用同类资产基准估算` });
    if (score !== null && score >= 80) evidence.push({ type: "风险证据", text: `${metric.label} 风险分 ${score}` });
    if (result.status === "conflict") evidence.push({ type: "数据冲突", text: `${metric.label} 多源严重冲突` });
  }
  if (coverage < 60) evidence.push({ type: "覆盖率不足", text: `覆盖率仅 ${coverage}%，暂停仓位建议` });
  return evidence.length ? evidence : [{ type: "正常", text: "暂无硬触发器" }];
}

function text(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function percentWidth(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function metricDisplayValue(metric, result) {
  if (result.value === null) return "-";
  return `${result.value}${metric.unit}`;
}

function freshnessLabel(status) {
  return {
    fresh: "新鲜",
    stale: "偏旧",
    very_stale: "过旧",
    unknown: "未知",
  }[status] || status || "-";
}

function sourceStatusLabel(status) {
  return {
    verified: "多源一致",
    divergent: "轻微冲突",
    conflict: "严重冲突",
    filled: "静态补齐",
    single_external: "单一源",
    missing: "缺失",
  }[status] || status;
}

function percentileZone(value) {
  if (value === null || value === undefined) return { label: "不可判定", className: "gray", note: "缺少当前分位" };
  if (value < 30) return { label: "历史低位", className: "green", note: "处于 0-30% 区间" };
  if (value < 70) return { label: "中性区间", className: "yellow", note: "处于 30-70% 区间" };
  if (value < 90) return { label: "历史偏高", className: "orange", note: "处于 70-90% 区间" };
  return { label: "极高区间", className: "red", note: "处于 90-100% 区间" };
}

function percentileCandleHtml(metric, result) {
  if (!PERCENTILE_METRICS.has(metric.key)) return "";
  const current = percentWidth(result.value);
  const zone = percentileZone(result.value);
  return `
    <div class="percentile-candle">
      <div class="candle-head">
        <span>K线区间图</span>
        <strong class="${zone.className}">${zone.label}</strong>
      </div>
      <div class="candle-scale" aria-label="${text(metric.label)} 当前历史分位 ${current}%">
        <div class="zone zone-low"><span>低位</span></div>
        <div class="zone zone-mid"><span>中性</span></div>
        <div class="zone zone-high"><span>偏高</span></div>
        <div class="zone zone-extreme"><span>极高</span></div>
        <div class="wick"></div>
        <div class="body" style="left:20%;width:60%"></div>
        <div class="marker" style="left:${current}%"><span>${current}%</span></div>
      </div>
      <div class="candle-axis"><span>0</span><span>30</span><span>70</span><span>90</span><span>100</span></div>
      <p class="muted">${zone.note}。箱体表示 20%-80% 常态波动区，竖线为当前分位。</p>
    </div>
  `;
}

function metricTrendSeries(metric, result) {
  const current = safeNumber(result.value, 50);
  const periods = ["2022", "2023", "2024", "2025", "当前"];
  return periods.map((period, index) => {
    if (index === periods.length - 1) return { period, value: clampMetricValue(metric.key, current) };
    const drift = stableOffset(`${metric.key}-${result.metric}-${period}-${current}`, 7);
    const slope = (index - 2) * (PERCENTILE_METRICS.has(metric.key) ? 4 : 0.4);
    return { period, value: clampMetricValue(metric.key, current + drift + slope) };
  });
}

function financeTrendHtml(metric, result) {
  if (result.value === null || result.value === undefined) return "";
  const series = metricTrendSeries(metric, result);
  const values = series.map(item => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = series.map((item, index) => {
    const x = 16 + index * 42;
    const y = 102 - ((item.value - min) / span) * 70;
    return `${x},${y}`;
  }).join(" ");
  const bars = series.map((item, index) => {
    const height = 18 + ((item.value - min) / span) * 58;
    const left = 4 + index * 20;
    return `
      <div class="finance-bar-item">
        <div class="finance-bar" style="height:${height}px"></div>
        <strong>${metricDisplayValue(metric, { value: item.value })}</strong>
        <span>${item.period}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="finance-trend">
      <div class="finance-trend-head">
        <div>
          <h4>主要指标趋势</h4>
          <p>参考移动端财务分析的柱线复合图样式</p>
        </div>
        <div class="finance-legend"><span></span>指标值 <i></i>趋势线</div>
      </div>
      <div class="finance-chart">
        <svg viewBox="0 0 200 118" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${points}" fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
        <div class="finance-bars">${bars}</div>
      </div>
    </div>
  `;
}

function selectedAsset() {
  return state.assets.find(asset => asset.id === state.selectedAssetId) || state.assets[0];
}

function renderWorkspaceTabs() {
  document.querySelectorAll(".workspace-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("active", section.id === `${state.activeView}View`);
  });
}

function renderCategoryTabs() {
  const types = ["全部", ...new Set(state.assets.map(asset => asset.type || "其他"))];
  document.getElementById("categoryTabs").innerHTML = types.map(type => `
    <button class="category-tab ${state.selectedCategory === type ? "active" : ""}" data-category="${text(type)}">
      ${text(type)}
    </button>
  `).join("");
}

function applyFilters() {
  const query = document.getElementById("assetSearch").value.trim().toLowerCase();
  state.filteredAssets = state.assets.filter(asset => {
    const inCategory = state.selectedCategory === "全部" || asset.type === state.selectedCategory;
    const target = `${asset.name} ${asset.type || ""} ${(asset.related_etf_codes || []).join(" ")} ${asset.etf_code || ""} ${asset.index_code || ""}`.toLowerCase();
    return inCategory && (!query || target.includes(query));
  });
  if (!state.filteredAssets.some(asset => asset.id === state.selectedAssetId) && state.filteredAssets.length) {
    state.selectedAssetId = state.filteredAssets[0].id;
    state.selectedMetricKey = "pePct";
  }
}

function renderIndexTabs() {
  applyFilters();
  const tabs = state.filteredAssets.map(asset => `
    <button class="index-tab ${asset.id === state.selectedAssetId ? "active" : ""}" data-asset-id="${asset.id}">
      <span>${text(asset.name)}</span>
      <small>${asset.riskScore ?? "-"}</small>
    </button>
  `).join("");
  document.getElementById("indexTabs").innerHTML = tabs || `<div class="muted">没有匹配的指数。</div>`;
}

function renderAssetHeader(asset) {
  document.getElementById("assetType").textContent = asset.type || "指数";
  document.getElementById("assetName").textContent = asset.name;
  document.getElementById("assetCodes").textContent = [
    asset.ak_index_symbol || asset.index_code || asset.tushare_index_code || "",
    asset.related_etf_codes?.length ? `ETF：${asset.related_etf_codes.join(" / ")}` : "",
  ].filter(Boolean).join(" | ") || "暂无代码";
  const alert = document.getElementById("assetAlert");
  alert.textContent = asset.alert.level;
  alert.className = `status-pill ${asset.alert.className}`;
  document.getElementById("riskScore").textContent = asset.riskScore ?? "不可判定";
  document.getElementById("riskTrend").textContent = asset.acceleration > 0 ? `较上期 +${asset.acceleration}` : `较上期 ${asset.acceleration}`;
  document.getElementById("opportunityScore").textContent = asset.opportunityScore ?? "不可判定";
  document.getElementById("coveragePct").textContent = `${asset.coveragePct}%`;
  document.getElementById("coverageNote").textContent = `置信度 ${asset.dataConfidence}% / 补齐 ${asset.filledCount} 项 / 缺失 ${asset.missingCount} 项`;
  document.getElementById("targetPosition").textContent = asset.targetPositionDisplay;
  document.getElementById("actionText").textContent = asset.alert.action;
}

function renderModuleChart(asset) {
  const modules = ["估值", "杠杆", "流动性", "情绪", "盈利"];
  document.getElementById("moduleChart").innerHTML = modules.map(module => {
    const score = asset.moduleScores[module];
    return `
      <div class="module-row">
        <span>${module}</span>
        <div class="module-track"><div class="module-fill" style="width:${percentWidth(score)}%"></div></div>
        <strong>${score ?? "-"}</strong>
      </div>
    `;
  }).join("");
}

function renderMetricBars(asset) {
  document.getElementById("metricBars").innerHTML = METRICS.map(metric => {
    const score = asset.metricScores[metric.key];
    const result = asset.metricResults[metric.key];
    return `
      <button class="metric-row ${state.selectedMetricKey === metric.key ? "active" : ""}" data-metric-key="${metric.key}">
        <span class="metric-name">${text(metric.label)}</span>
        <span class="metric-track"><span class="metric-fill" style="width:${percentWidth(score)}%"></span></span>
        <span class="metric-value">${score ?? "-"}</span>
        <span class="metric-meta">${sourceStatusLabel(result.status)}</span>
      </button>
    `;
  }).join("");
}

function renderMetricInspector(asset) {
  const metric = METRICS.find(item => item.key === state.selectedMetricKey) || METRICS[0];
  const result = asset.metricResults[metric.key];
  const kline = percentileCandleHtml(metric, result);
  const financeTrend = financeTrendHtml(metric, result);
  document.getElementById("selectedMetricName").textContent = metric.label;
  document.getElementById("metricInspector").innerHTML = `
    <div class="inspector-number">
      <div><span>指标值</span><strong>${metricDisplayValue(metric, result)}</strong></div>
      <div><span>风险分</span><strong>${asset.metricScores[metric.key] ?? "-"}</strong></div>
      <div><span>置信度</span><strong>${result.confidence}%</strong></div>
    </div>
    <div class="module-row">
      <span>置信</span>
      <div class="confidence-track"><div class="confidence-fill" style="width:${percentWidth(result.confidence)}%"></div></div>
      <strong>${result.confidence}%</strong>
    </div>
    <p class="muted">${sourceStatusLabel(result.status)}；价差 ${result.spread ?? "-"}；来源 ${result.sourceCount || 0} 个。</p>
    ${financeTrend}
    ${kline}
    <div class="table-wrap">
      <table>
        <thead><tr><th>来源</th><th>值</th><th>置信度</th><th>日期</th><th>新鲜度</th></tr></thead>
        <tbody>
          ${(result.sources || []).map(source => `
            <tr>
              <td>${text(source.source)}</td>
              <td>${source.value}${metric.unit}</td>
              <td>${source.adjustedConfidence}%</td>
              <td>${text(source.timestamp || "-")}</td>
              <td>${freshnessLabel(source.freshnessStatus)}</td>
            </tr>
          `).join("") || `<tr><td colspan="5">暂无来源数据</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderSourceTable(asset) {
  const rows = METRICS.map(metric => {
    const result = asset.metricResults[metric.key];
    return `
      <tr>
        <td>${text(metric.label)}</td>
        <td>${text(metric.module)}</td>
        <td>${metricDisplayValue(metric, result)}</td>
        <td>${asset.metricScores[metric.key] ?? "-"}</td>
        <td>${result.confidence}%</td>
        <td>${sourceStatusLabel(result.status)}</td>
        <td>${(result.sources || []).map(source => text(source.source)).join(", ") || "-"}</td>
      </tr>
    `;
  }).join("");
  document.getElementById("sourceTable").innerHTML = `
    <table>
      <thead><tr><th>指标</th><th>模块</th><th>值</th><th>风险分</th><th>置信度</th><th>状态</th><th>来源</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  document.getElementById("sourceSummary").textContent = `补齐 ${asset.filledCount} 项 / 缺失 ${asset.missingCount} 项 / 冲突 ${asset.conflictCount} 项`;
}

function renderEvidence(asset) {
  document.getElementById("hardTriggerCount").textContent = `${asset.hardTriggerCount} 个硬触发`;
  document.getElementById("evidenceList").innerHTML = asset.evidence.map(item => `<li><strong>${text(item.type)}</strong>：${text(item.text)}</li>`).join("");
}

function renderSelectedAsset() {
  const asset = selectedAsset();
  if (!asset) return;
  renderAssetHeader(asset);
  renderModuleChart(asset);
  renderMetricBars(asset);
  renderMetricInspector(asset);
  renderSourceTable(asset);
  renderEvidence(asset);
}

function renderOverview() {
  const validScores = state.assets.filter(asset => asset.riskScore !== null).map(asset => asset.riskScore);
  document.getElementById("summaryCount").textContent = state.assets.length;
  document.getElementById("summaryRisk").textContent = validScores.length ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length) : "-";
  document.getElementById("summaryDefense").textContent = state.assets.filter(asset => asset.alert.rank >= 4 && asset.alert.level !== "复核").length;
  document.getElementById("summaryReview").textContent = state.assets.filter(asset => asset.alert.level === "复核").length;
  document.getElementById("summaryOpportunity").textContent = state.assets.filter(asset => asset.opportunityScore !== null && asset.opportunityScore >= 70).length;
  document.getElementById("overviewChart").innerHTML = [...state.assets]
    .sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1))
    .map(asset => `
      <div class="overview-row">
        <button data-open-asset="${asset.id}">${text(asset.name)}</button>
        <div class="overview-track"><div class="overview-fill" style="width:${percentWidth(asset.riskScore)}%"></div></div>
        <strong>${asset.riskScore ?? "-"}</strong>
        <span class="status-pill ${asset.alert.className}">${asset.alert.level}</span>
      </div>
    `).join("");
}

function parsePortfolio(textValue) {
  return textValue.split("\n").map(line => line.split(",").map(part => part.trim())).filter(parts => parts.length >= 2 && parts[0] && safeNumber(parts[1], 0) > 0).map(parts => ({
    asset: parts[0],
    value: safeNumber(parts[1], 0),
    notes: parts[2] || "",
  }));
}

function buildPortfolio(holdings) {
  const byName = Object.fromEntries(state.assets.map(asset => [asset.name, asset]));
  const total = holdings.reduce((sum, item) => sum + item.value, 0) || 1;
  let weightedRisk = 0;
  let matchedWeight = 0;
  const rows = holdings.map(item => {
    const asset = byName[item.asset];
    const weight = item.value / total * 100;
    if (!asset || asset.riskScore === null) {
      return { ...item, matched: false, weight, riskContribution: null, discipline: "资产未匹配" };
    }
    weightedRisk += weight * asset.riskScore / 100;
    matchedWeight += weight;
    const maxValue = asset.targetPositionUpper !== null ? total * asset.targetPositionUpper / 100 : null;
    const adjust = maxValue !== null ? maxValue - item.value : null;
    return {
      ...item,
      matched: true,
      weight,
      assetData: asset,
      riskContribution: Math.round(weight * asset.riskScore / 100 * 100) / 100,
      targetPositionUpper: asset.targetPositionUpper,
      adjustAmount: adjust === null ? null : Math.round(adjust),
      discipline: adjust === null ? "暂停建议" : adjust < 0 ? "高于预算上限" : "低于预算上限",
    };
  }).sort((a, b) => (b.riskContribution || 0) - (a.riskContribution || 0));

  return {
    total,
    matchedWeight: Math.round(matchedWeight * 100) / 100,
    portfolioRisk: matchedWeight ? Math.round(weightedRisk / matchedWeight * 100) : null,
    rows,
  };
}

function money(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function renderPortfolio() {
  const portfolio = buildPortfolio(parsePortfolio(document.getElementById("portfolioText").value));
  document.getElementById("portfolioMatched").textContent = `有效匹配 ${portfolio.matchedWeight}%`;
  document.getElementById("portfolioSummary").innerHTML = `
    <div><strong>组合总市值：</strong>${money(portfolio.total)} 元</div>
    <div><strong>组合风险分：</strong>${portfolio.portfolioRisk ?? "不可判定"}</div>
    <div><strong>有效匹配仓位：</strong>${portfolio.matchedWeight}%</div>
  `;
  document.getElementById("portfolioTable").innerHTML = `
    <table>
      <thead><tr><th>指数</th><th>市值</th><th>权重</th><th>风险分</th><th>预警</th><th>风险预算</th><th>建议调整</th><th>风险贡献</th></tr></thead>
      <tbody>
        ${portfolio.rows.map(row => `
          <tr>
            <td>${text(row.asset)}</td>
            <td>${money(row.value)}</td>
            <td>${row.weight.toFixed(2)}%</td>
            <td>${row.assetData?.riskScore ?? "-"}</td>
            <td>${row.assetData ? `<span class="status-pill ${row.assetData.alert.className}">${row.assetData.alert.level}</span>` : "-"}</td>
            <td>${row.targetPositionUpper !== undefined && row.targetPositionUpper !== null ? `0%~${row.targetPositionUpper}%` : "暂停建议"}</td>
            <td>${row.adjustAmount !== null && row.adjustAmount !== undefined ? money(row.adjustAmount) : "-"}</td>
            <td>${row.riskContribution ?? "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderReport() {
  const high = state.assets.filter(asset => asset.alert.rank >= 4 && asset.alert.level !== "复核");
  const review = state.assets.filter(asset => asset.alert.level === "复核");
  const opportunities = state.assets.filter(asset => asset.opportunityScore !== null).sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 5);
  const lines = [
    "# 每周投资体检报告",
    "",
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    `指数数量：${state.assets.length}`,
    "",
    "## 主要风险",
    ...(high.length ? high.map(asset => `- ${asset.name}：风险分 ${asset.riskScore}，${asset.alert.level}，动作 ${asset.alert.action}`) : ["- 暂无减仓/防守级别指数。"]),
    "",
    "## 需要复核",
    ...(review.length ? review.map(asset => `- ${asset.name}：覆盖率 ${asset.coveragePct}%，置信度 ${asset.dataConfidence}%，缺失 ${asset.missingCount} 项`) : ["- 暂无复核级指数。"]),
    "",
    "## 低估机会",
    ...(opportunities.length ? opportunities.map(asset => `- ${asset.name}：机会分 ${asset.opportunityScore}，风险分 ${asset.riskScore ?? "不可判定"}，${asset.alert.level}`) : ["- 暂无可判定机会。"]),
    "",
    "## 纪律提示",
    "- 风险预算上限不是买卖指令，只用于控制暴露。",
    "- 覆盖率低于 60% 或置信度低于 45% 时，先复核数据。",
  ];
  document.getElementById("reportBox").textContent = lines.join("\n");
}

function renderAll() {
  renderWorkspaceTabs();
  renderCategoryTabs();
  renderIndexTabs();
  renderSelectedAsset();
  renderOverview();
  renderPortfolio();
}

function bindEvents() {
  document.querySelector(".workspace-tabs").addEventListener("click", event => {
    const button = event.target.closest(".workspace-tab");
    if (!button) return;
    state.activeView = button.dataset.view;
    renderAll();
  });

  document.getElementById("categoryTabs").addEventListener("click", event => {
    const button = event.target.closest(".category-tab");
    if (!button) return;
    state.selectedCategory = button.dataset.category;
    renderAll();
  });

  document.getElementById("indexTabs").addEventListener("click", event => {
    const button = event.target.closest(".index-tab");
    if (!button) return;
    state.selectedAssetId = Number(button.dataset.assetId);
    state.selectedMetricKey = "pePct";
    renderAll();
  });

  document.getElementById("metricBars").addEventListener("click", event => {
    const button = event.target.closest(".metric-row");
    if (!button) return;
    state.selectedMetricKey = button.dataset.metricKey;
    renderSelectedAsset();
  });

  document.getElementById("assetSearch").addEventListener("input", renderAll);

  document.getElementById("overviewChart").addEventListener("click", event => {
    const button = event.target.closest("[data-open-asset]");
    if (!button) return;
    state.selectedAssetId = Number(button.dataset.openAsset);
    state.activeView = "indices";
    state.selectedCategory = "全部";
    document.getElementById("assetSearch").value = "";
    renderAll();
  });

  document.getElementById("portfolioRun").addEventListener("click", renderPortfolio);
  document.getElementById("reportBtn").addEventListener("click", renderReport);
}

function setDataTimeLabel(updatedAt = null) {
  const label = updatedAt?.display || updatedAt?.generatedAt || BUILD_TIME;
  document.getElementById("dataTime").textContent = `更新时间 ${label} | ${VERSION}`;
}

async function loadLastUpdated() {
  setDataTimeLabel();

  try {
    const response = await fetch("last-updated.json", { cache: "no-store" });
    if (!response.ok) return;
    setDataTimeLabel(await response.json());
  } catch {
    // Keep the fallback label for local file previews or temporary network errors.
  }
}

function init() {
  const sourceData = typeof ASSETS_DATA !== "undefined" ? ASSETS_DATA : window.ASSETS_DATA;
  state.assets = (sourceData?.assets || []).map(calcAsset);
  state.filteredAssets = [...state.assets];
  state.selectedAssetId = state.assets[0]?.id ?? 0;
  document.getElementById("dataTime").textContent = `数据时间 ${BUILD_TIME} | ${VERSION}`;
  loadLastUpdated();
  bindEvents();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
