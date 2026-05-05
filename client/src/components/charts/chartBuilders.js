// Helpers privados para evitar duplicacion entre los builders.

function buildDateLabels(dates) {
  return dates.map((d) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  });
}

function buildLineDataset(values, color, bg) {
  return {
    data: values,
    borderColor: color,
    backgroundColor: bg,
    fill: true,
    tension: 0.4,
    pointRadius: 3,
    pointBackgroundColor: color,
  };
}

function buildBarDataset(values, backgroundColor, extra = {}) {
  return {
    data: values,
    backgroundColor,
    borderRadius: 6,
    borderSkipped: false,
    ...extra,
  };
}

export function buildTrendData(byDay) {
  const labels = Object.keys(byDay || {}).sort();
  return {
    labels: buildDateLabels(labels),
    datasets: [
      buildLineDataset(
        labels.map((d) => byDay[d]),
        "#d4aa63",
        "rgba(212,170,99,0.15)",
      ),
    ],
  };
}

export function buildByActionData(byAction) {
  return {
    labels: Object.keys(byAction || {}),
    datasets: [
      buildBarDataset(Object.values(byAction || {}), ["#4ade80", "#60a5fa", "#f87171"], {
        borderRadius: 8,
      }),
    ],
  };
}

export function buildByEntityData(byEntity) {
  return {
    labels: Object.keys(byEntity || {}),
    datasets: [
      {
        data: Object.values(byEntity || {}),
        backgroundColor: ["#d4aa63", "#a78bfa", "#34d399", "#f472b6", "#f59e0b"],
        borderWidth: 0,
      },
    ],
  };
}

export function buildByHourData(byHour) {
  const values = Array.from({ length: 24 }, (_, h) => byHour?.[h] || 0);
  return {
    labels: Array.from({ length: 24 }, (_, h) => `${h}:00`),
    datasets: [buildBarDataset(values, "rgba(96,165,250,0.6)", { borderRadius: 4 })],
  };
}

export function buildDurationByDayData(durationByDay) {
  const labels = Object.keys(durationByDay || {}).sort();
  return {
    labels: buildDateLabels(labels),
    datasets: [
      buildLineDataset(
        labels.map((d) => durationByDay[d] || 0),
        "#f472b6",
        "rgba(244,114,182,0.15)",
      ),
    ],
  };
}

export function buildByUserData(byUser) {
  return {
    labels: Object.keys(byUser || {}),
    datasets: [buildBarDataset(Object.values(byUser || {}), "rgba(167,139,250,0.7)")],
  };
}

export function buildCategoriasData(categorias) {
  return {
    labels: categorias.map((c) => c.label),
    datasets: [
      buildBarDataset(
        categorias.map((c) => c.count),
        "rgba(212,170,99,0.6)",
        { borderColor: "#d4aa63", borderWidth: 1 },
      ),
    ],
  };
}

export function buildIngredientsData(topIngredients) {
  return {
    labels: topIngredients.map((i) => i.name),
    datasets: [
      buildBarDataset(
        topIngredients.map((i) => i.count),
        "rgba(52,211,153,0.7)",
      ),
    ],
  };
}
