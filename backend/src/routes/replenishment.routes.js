const express = require("express");
const router = express.Router();
const {
  replenishStock,
  getReplenishments,
} = require("../controllers/replenishment.controller");

router.post("/", replenishStock);
router.get("/", getReplenishments);
module.exports = router;
