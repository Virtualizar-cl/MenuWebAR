const tooltipDefaults = {
  backgroundColor: "rgba(0,0,0,0.85)",
  titleColor: "#d4aa63",
  bodyColor: "rgba(255,255,255,0.8)",
  padding: 10,
  cornerRadius: 8,
};

export const barOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: tooltipDefaults },
  scales: {
    x: {
      ticks: { color: "rgba(255,255,255,0.45)", font: { size: 11 } },
      grid: { color: "rgba(255,255,255,0.05)" },
    },
    y: {
      ticks: { color: "rgba(255,255,255,0.45)" },
      grid: { color: "rgba(255,255,255,0.05)" },
      beginAtZero: true,
    },
  },
});

export const lineOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults, mode: "index" } },
  scales: {
    x: {
      ticks: { color: "rgba(255,255,255,0.45)", font: { size: 11 } },
      grid: { color: "rgba(255,255,255,0.05)" },
    },
    y: {
      ticks: { color: "rgba(255,255,255,0.45)" },
      grid: { color: "rgba(255,255,255,0.05)" },
      beginAtZero: true,
    },
  },
});

export const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "right",
      labels: {
        color: "rgba(255,255,255,0.7)",
        font: { size: 12 },
        padding: 16,
        usePointStyle: true,
      },
    },
    tooltip: tooltipDefaults,
  },
};
