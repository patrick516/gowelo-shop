const express = require("express");
const router = express.Router();
const controller = require("../controllers/customer.controller");

// Get all customers with outstanding debts
router.get("/debtors", controller.getDebtors);

// Add a credit sale (customer buys on loan)
router.post("/credit-sale", controller.creditSale);

// Record a payment from a debtor
router.post("/pay-debt", controller.payDebt);

// Borrow again (increase debt for an existing customer)
router.post("/borrow", controller.borrowAgain);

// Get full borrow/payment history for a specific customer
router.get("/:customerId/history", controller.getCustomerHistory);

module.exports = router;
