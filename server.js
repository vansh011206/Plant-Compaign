require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { createTransport } = nodemailer;
const { convert } = require("html-to-text");
const crypto = require("crypto");

console.log("PLANT.ID KEY:", process.env.PLANT_ID_API_KEY ? "LOADED" : "MISSING");
console.log("Environment:", process.env.NODE_ENV || "development");

// ===================== APP =====================
const app = express();

// ===================== HELPER FUNCTIONS =====================
const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.BASE_URL) return process.env.BASE_URL;
  return `http://localhost:${process.env.PORT || 5000}`;
};

// ===================== TRUST PROXY (REQUIRED FOR VERCEL) =====================
app.set("trust proxy", 1);

// ===================== STATIC FILES =====================
app.use(express.static(path.join(__dirname, "view")));
app.use("/uploads", express.static(path.join(__dirname, "view", "uploads")));

// ===================== MIDDLEWARES =====================
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// CORS - Flexible for development & Vercel preview/custom domains
const allowedOrigins = [
  `http://localhost:${process.env.PORT || 5000}`,
  "http://localhost:3000",
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.BASE_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        callback(null, true);
      } else {
        callback(null, true); // ← temporarily permissive – tighten later if needed
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// ===================== DATABASE CONNECTION =====================
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);
    throw error;
  }
};

connectDB(); // initial connection

// ===================== SCHEMAS =====================
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  photo: String,
  verified: { type: Boolean, default: false },
  level: { type: Number, default: 1 },
  profileCompletion: { type: Number, default: 0 },
  totalPlants: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  avgSunlight: { type: Number, default: 0 },
  healthScore: { type: Number, default: 0 },
  location: String,
  favoritePlants: [String],
  darkMode: { type: Boolean, default: false },
  notifications: { type: Boolean, default: true },
  weeklySummary: { type: Boolean, default: true },
  recentActivity: [{ text: String, time: Date }],
  createdAt: { type: Date, default: Date.now },
});

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  expiry: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 }, // TTL 10 min
});

const gardenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  commonName: String,
  scientificName: String,
  confidence: Number,
  family: String,
  care: {
    water: String,
    light: String,
    soil: String,
    temp: String,
    toxic: String,
  },
  lastWatered: { type: Date, default: Date.now },
  nextWatering: Date,
  addedAt: { type: Date, default: Date.now },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);
const OTP = mongoose.models.OTP || mongoose.model("OTP", otpSchema);
const Garden = mongoose.models.Garden || mongoose.model("Garden", gardenSchema);

// ===================== SESSION =====================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "plantcare-secret-2025",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 24 * 60 * 60, // 24 hours
      autoRemove: "native",
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

// ===================== PASSPORT =====================
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return done(null, false, { message: "Wrong email or password" });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// ===================== AUTH MIDDLEWARE =====================
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Not authenticated", redirect: "/login" });
  }
  res.redirect("/login");
};

const requireVerified = (req, res, next) => {
  if (req.user?.verified) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(403).json({ error: "Email not verified", redirect: "/verify-otp" });
  }
  res.redirect("/verify-otp");
};

// ===================== EMAIL TRANSPORTER =====================
const transporter = createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ===================== HELPER: EXTRACT WATERING DAYS =====================
function extractWateringDays(waterStr) {
  if (!waterStr) return 3;
  const match = waterStr.match(/every\s+(\d+(?:-\d+)?)\s+days?/i);
  if (!match) return 3;
  const range = match[1];
  if (range.includes("-")) {
    const [min, max] = range.split("-").map(Number);
    return Math.round((min + max) / 2);
  }
  return parseInt(range);
}

// ===================== EMAIL TEMPLATES =====================
// (keeping your latest versions – they look good)
function getOTPEmailTemplate(name, otp) {
  const baseUrl = getBaseUrl();
  // ... your full OTP template here (same as you had)
  // I won't repeat the full HTML for brevity
  return `...`; // ← paste your full template
}

function getGardenAddEmail(plant, name) {
  // ... your full template
  return `...`;
}

function getWateringReminderEmail(plant, name) {
  // ... your full template
  return `...`;
}

// ===================== ROUTES =====================
// Public pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "view", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "view", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "view", "signup.html")));
app.get("/verify-otp", requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "view", "verify-otp.html"))
);

// Protected pages
app.get(
  ["/dashboard", "/examine", "/profile", "/calendar", "/contact"],
  requireAuth,
  requireVerified,
  (req, res) => {
    const file = req.path === "/dashboard" ? "dashboard.html" : req.path.slice(1) + ".html";
    res.sendFile(path.join(__dirname, "view", file));
  }
);

// API endpoints (signup, login, verify-otp, profile, garden, etc.)
// ... paste all your API routes here (signup, login, verify-otp, resend-otp, profile, identify-plant, add-to-garden, garden CRUD, watering, cron, etc.)

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.status(404).sendFile(path.join(__dirname, "view", "index.html"));
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({ error: "Internal server error" });
  }
  res.status(500).send("Something went wrong!");
});

// For Vercel - export the app (do NOT call app.listen)
module.exports = app;

// For local development only
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🌱 LIVE → http://localhost:${PORT}`);
  });
}