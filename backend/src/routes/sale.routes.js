const express = require("express");
const router = express.Router();
const { sellProduct } = require("../controllers/sale.controller");

router.post("/", sellProduct);

module.exports = router;
