const express = require("express");
const { getStats, getLogs, clearLogs } = require("../services/logsStore");

const router = express.Router();

router.get("/stats", async (req, res) => {
  const { days = "7", username } = req.query;
  try {
    const stats = await getStats({
      days: parseInt(days, 10),
      username,
    });
    res.json(stats);
  } catch (err) {
    console.error("Error getting stats:", err.message);
    res.status(500).json({ error: "Error getting stats" });
  }
});

router.get("/", async (req, res) => {
  const { limit = "50", offset = "0", action, entityType, username } = req.query;
  try {
    const logs = await getLogs({
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      action,
      entityType,
      username,
    });
    res.json(logs);
  } catch (err) {
    console.error("Error getting logs:", err.message);
    res.status(500).json({ error: "Error getting logs" });
  }
});

router.delete("/clear", async (_req, res) => {
  try {
    await clearLogs();
    res.json({ message: "Logs cleared" });
  } catch (err) {
    console.error("Error clearing logs:", err.message);
    res.status(500).json({ error: "Error clearing logs" });
  }
});

module.exports = router;
