const express = require("express");
const router = express.Router();
const {
  register,
  login,
  forgotPassword,
  resetPassword,
} = require("../controllers/auth.controller");

router.post("/register", register);
router.post("/login", login);
router.post("/forgot", forgotPassword);
router.put("/reset/:token", resetPassword);

module.exports = router;
