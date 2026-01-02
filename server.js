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

console.log(
  "PLANT.ID KEY:",
  process.env.PLANT_ID_API_KEY ? "LOADED" : "MISSING"
);
console.log("Environment:", process.env.NODE_ENV || "development");

// ===================== APP =====================
const app = express();
const PORT = process.env.PORT || 5000;

// ===================== HELPER FUNCTIONS =====================
const getBaseUrl = () => {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  return `http://localhost:${PORT}`;
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

// ===================== CORS (PRODUCTION READY) =====================
const allowedOrigins = [
  `http://localhost:${PORT}`,
  "http://localhost:3000",
  "http://localhost:5000",
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.BASE_URL || null,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Check if origin is allowed
      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Allow all for now, restrict later if needed
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// ===================== DATABASE =====================
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    const db = await mongoose.connect(process.env.MONGO_URI, {
      bufferCommands: false,
    });
    isConnected = db.connections[0].readyState === 1;
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);
    throw error;
  }
};

// Connect to database
connectDB();

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

// OTP Schema (for persistent storage instead of in-memory)
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  expiry: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 }, // Auto-delete after 10 mins
});

// Garden/Plant Schema
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

// ===================== SESSION (MONGODB STORE) =====================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "plantcare-secret-2025",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 24 * 60 * 60, // 1 day
      autoRemove: "native",
      touchAfter: 24 * 3600, // Lazy update session
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

// ===================== PASSPORT =====================
app.use(passport.initialize());
app.use(passport.session());

// ===================== PASSPORT CONFIG =====================
passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        await connectDB();
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
          return done(null, false, { message: "Wrong email or password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    await connectDB();
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// ===================== AUTH MIDDLEWARE =====================
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();

  // Check if API request
  if (req.path.startsWith("/api/")) {
    return res
      .status(401)
      .json({ error: "Not authenticated", redirect: "/login" });
  }
  res.redirect("/login");
};

const requireVerified = (req, res, next) => {
  if (req.user?.verified) return next();

  if (req.path.startsWith("/api/")) {
    return res
      .status(403)
      .json({ error: "Email not verified", redirect: "/verify-otp" });
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
  if (!waterStr) return 3; // Default 3 days
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
function getOTPEmailTemplate(name, otp) {
  const baseUrl = getBaseUrl();
  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify Your PlantCare AI Account</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
body { margin: 0; padding: 0; background: #f4f7f6; font-family: 'Inter', sans-serif; }
.container { max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
.header { background: linear-gradient(135deg, #059669, #047857); padding: 30px 20px; text-align: center; color: white; }
.logo { width: 60px; height: 60px; margin-bottom: 12px; }
.title { font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
.subtitle { font-size: 16px; opacity: 0.9; margin: 8px 0 0; }
.body { padding: 40px 30px; text-align: center; color: #1e293b; }
.otp-box { display: inline-block; background: #ecfdf5; padding: 20px 40px; border-radius: 16px; margin: 20px 0; border: 2px dashed #059669; }
.otp { font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #059669; margin: 0; }
.message { font-size: 16px; color: #475569; margin: 20px 0; line-height: 1.6; }
.footer { background: #f8fafc; padding: 25px; text-align: center; font-size: 13px; color: #94a3b8; }
.btn { display: inline-block; background: linear-gradient(135deg, #059669, #047857); color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; margin: 20px 0; box-shadow: 0 4px 12px rgba(5,150,105,0.3); }
@media (max-width: 480px) { .title { font-size: 24px; } .otp { font-size: 28px; letter-spacing: 4px; } .body { padding: 30px 20px; } }
</style></head><body>
<div class="container">
    <div class="header">
        <svg class="logo" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white"/>
            <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round"/>
            <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <h1 class="title">PlantCare AI</h1>
        <p class="subtitle">Your Plant Companion</p>
    </div>
    <div class="body">
        <h2 style="margin-bottom: 16px; color: #1e293b;">Hello ${name}!</h2>
        <p class="message">Welcome to <strong>PlantCare AI</strong>! Please verify your email with the OTP below:</p>
        <div class="otp-box"><p class="otp">${otp}</p></div>
        <p class="message">This code expires in <strong>10 minutes</strong>. If you didn't request this, ignore this email.</p>
        <a href="${baseUrl}/verify-otp" class="btn">Verify Now</a>
    </div>
    <div class="footer">
        <p>&copy; 2025 PlantCare AI. All rights reserved.</p>
        <p>Need help? <a href="mailto:support@plantcare.ai" style="color: #059669;">Contact Support</a></p>
    </div>
</div>
</body></html>
    `.trim();
}

function getGardenAddEmail(plant, name) {
  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Added to Garden: ${plant.commonName}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
body { margin: 0; padding: 0; background: #f4f7f6; font-family: 'Inter', sans-serif; }
.container { max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
.header { background: linear-gradient(135deg, #059669, #047857); padding: 30px 20px; text-align: center; color: white; }
.logo { width: 60px; height: 60px; margin-bottom: 12px; }
.title { font-size: 28px; font-weight: 700; margin: 0; }
.body { padding: 40px 30px; color: #1e293b; }
.plant-name { font-size: 24px; font-weight: 700; color: #059669; margin: 0 0 8px; }
.sci-name { font-style: italic; color: #64748b; margin: 0 0 20px; }
.care-grid { display: grid; gap: 16px; margin: 24px 0; }
.care-item { display: flex; align-items: center; gap: 12px; background: #f8fafc; padding: 12px; border-radius: 12px; }
.care-icon { width: 20px; height: 20px; }
.footer { background: #f8fafc; padding: 25px; text-align: center; font-size: 13px; color: #94a3b8; }
</style></head><body>
<div class="container">
    <div class="header">
        <svg class="logo" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white"/>
            <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2"/>
            <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2"/>
        </svg>
        <h1 class="title">PlantCare AI</h1>
    </div>
    <div class="body">
        <h2>Hello ${name}!</h2>
        <p><strong>${
          plant.commonName
        }</strong> has been added to your garden!</p>
        <h3 class="plant-name">${plant.commonName}</h3>
        <p class="sci-name">${plant.scientificName}</p>
        <div class="care-grid">
            <div class="care-item">
                <svg class="care-icon" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2">
                    <path d="M12 2.69L5.5 9.19L12 15.69L18.5 9.19L12 2.69Z"/>
                    <path d="M12 15.69V22.31"/>
                </svg>
                <div><strong>Water:</strong> ${
                  plant.care?.water || "Every 2-3 days"
                }</div>
            </div>
            <div class="care-item">
                <svg class="care-icon" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="M12 1V3"/>
                    <path d="M12 21V23"/>
                </svg>
                <div><strong>Light:</strong> ${
                  plant.care?.light || "Full sun"
                }</div>
            </div>
        </div>
        <p><em>We'll remind you when it's time to water!</em></p>
    </div>
    <div class="footer">
        <p>© 2025 PlantCare AI</p>
    </div>
</div>
</body></html>
    `.trim();
}

function getWateringReminderEmail(plant, name) {
  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Time to Water: ${plant.commonName}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
body { margin: 0; padding: 0; background: #ecfdf5; font-family: 'Inter', sans-serif; }
.container { max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
.header { background: linear-gradient(135deg, #059669, #047857); padding: 40px 20px; text-align: center; color: white; }
.title { font-size: 32px; font-weight: 700; margin: 0; }
.body { padding: 40px 30px; text-align: center; }
.water-drop { font-size: 80px; margin: 20px 0; }
.message { font-size: 18px; color: #1e293b; margin: 20px 0; line-height: 1.6; }
.plant { font-weight: 700; color: #059669; font-size: 20px; }
.footer { background: #f8fafc; padding: 25px; text-align: center; font-size: 13px; color: #94a3b8; }
</style></head><body>
<div class="container">
    <div class="header">
        <div class="water-drop">💧</div>
        <h1 class="title">Time to Water!</h1>
    </div>
    <div class="body">
        <p class="message">Hey <strong>${name}</strong>!</p>
        <p class="message">Your <span class="plant">${plant.commonName}</span> needs watering!</p>
        <p class="message"><strong>Give it some water today!</strong></p>
        <p class="message"><em>We'll remind you again next time!</em></p>
    </div>
    <div class="footer">
        <p>© 2025 PlantCare AI - Your Plant Buddy</p>
    </div>
</div>
</body></html>
    `.trim();
}

// ===================== PUBLIC PAGES =====================
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "view", "index.html"))
);
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "view", "login.html"))
);
app.get("/signup", (req, res) =>
  res.sendFile(path.join(__dirname, "view", "signup.html"))
);
app.get("/verify-otp", requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "view", "verify-otp.html"))
);

// ===================== PROTECTED PAGES =====================
app.get(
  ["/dashboard", "/examine", "/profile", "/calendar", "/contact"],
  requireAuth,
  requireVerified,
  (req, res) => {
    const file =
      req.path === "/dashboard"
        ? "dashboard.html"
        : req.path.slice(1) + ".html";
    res.sendFile(path.join(__dirname, "view", file));
  }
);

// ===================== API: HEALTH CHECK =====================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// ===================== API: SIGNUP =====================
app.post("/api/signup", async (req, res) => {
  try {
    await connectDB();

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = new User({
      name,
      email,
      password: hashed,
      photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(
        name
      )}&background=66bb6a&color=fff`,
    });
    await user.save();

    // Store OTP in MongoDB (replaces in-memory Map)
    await OTP.findOneAndUpdate(
      { email },
      { email, otp, expiry: otpExpiry },
      { upsert: true, new: true }
    );

    try {
      await transporter.sendMail({
        from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Your OTP: ${otp} - Verify PlantCare AI Account`,
        html: getOTPEmailTemplate(name, otp),
        text: convert(getOTPEmailTemplate(name, otp)),
      });
      console.log(`OTP Email Sent to ${email}`);
    } catch (emailErr) {
      console.error("Email Error:", emailErr);
      // Don't fail signup if email fails, user can request new OTP
    }

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: "Login failed" });
      res.json({ success: true, redirect: "/verify-otp" });
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

// ===================== API: VERIFY OTP =====================
app.post("/api/verify-otp", requireAuth, async (req, res) => {
  try {
    await connectDB();

    const { otp } = req.body;
    const email = req.user.email;

    const storedOTP = await OTP.findOne({ email });

    if (!storedOTP || new Date() > storedOTP.expiry) {
      return res.status(400).json({ error: "OTP expired or invalid" });
    }

    if (storedOTP.otp !== otp) {
      return res.status(400).json({ error: "Wrong OTP" });
    }

    await User.updateOne({ _id: req.user._id }, { verified: true });
    await OTP.deleteOne({ email });

    res.json({ success: true, redirect: "/dashboard" });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ===================== API: RESEND OTP =====================
app.post("/api/resend-otp", requireAuth, async (req, res) => {
  try {
    await connectDB();

    const email = req.user.email;
    const name = req.user.name;
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.findOneAndUpdate(
      { email },
      { email, otp, expiry: otpExpiry },
      { upsert: true, new: true }
    );

    await transporter.sendMail({
      from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your New OTP: ${otp} - PlantCare AI`,
      html: getOTPEmailTemplate(name, otp),
      text: convert(getOTPEmailTemplate(name, otp)),
    });

    res.json({ success: true, message: "OTP sent!" });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ error: "Failed to resend OTP" });
  }
});

// ===================== API: LOGIN =====================
app.post("/api/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return res.status(500).json({ error: "Server error" });
    if (!user)
      return res.status(400).json({ error: "Wrong email or password" });

    req.logIn(user, (loginErr) => {
      if (loginErr) return res.status(500).json({ error: "Login failed" });
      res.json({
        success: true,
        redirect: user.verified ? "/dashboard" : "/verify-otp",
      });
    });
  })(req, res, next);
});

// ===================== API: LOGOUT =====================
app.post("/api/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    req.session.destroy((destroyErr) => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

// ===================== API: PROFILE =====================
app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    await connectDB();

    if (!req.user.verified) {
      return res
        .status(403)
        .json({ error: "Email not verified", redirect: "/verify-otp" });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Profile Error:", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.post("/api/profile", requireAuth, async (req, res) => {
  try {
    await connectDB();

    const updates = {};
    const allowedFields = [
      "name",
      "location",
      "darkMode",
      "notifications",
      "weeklySummary",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Handle photo URL if provided
    if (req.body.photo) {
      updates.photo = req.body.photo;
    }

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
    }).select("-password");

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Profile Update Error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ===================== API: IDENTIFY PLANT =====================
app.post("/api/identify-plant", async (req, res) => {
  try {
    let img = req.body.imageBase64;
    if (!img) return res.status(400).json({ error: "No image provided" });
    if (img.includes(",")) img = img.split(",")[1];

    const response = await fetch("https://api.plant.id/v3/identification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": process.env.PLANT_ID_API_KEY,
      },
      body: JSON.stringify({ images: [img] }),
    });

    const data = await response.json();

    if (!response.ok || !data.result?.classification?.suggestions?.[0]) {
      return res
        .status(400)
        .json({ error: "Plant not detected! Try a clearer photo." });
    }

    const s = data.result.classification.suggestions[0];
    let commonName = "Unknown Plant";

    if (s.common_names && s.common_names.length > 0) {
      commonName = s.common_names[0];
    } else {
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            s.name
          )}`
        );
        if (wikiRes.ok) {
          const wiki = await wikiRes.json();
          const extract = wiki.extract || "";
          const match =
            extract.match(/commonly known as\s+([A-Za-z\s\(\)]+)/i) ||
            extract.match(/known as\s+([A-Za-z\s\(\)]+)/i);
          if (match) commonName = match[1].trim();
        }
      } catch (e) {
        console.log("Wikipedia lookup failed:", e.message);
      }
    }

    const plant = {
      commonName,
      scientificName: s.name || "Unknown",
      confidence: Math.round(s.probability * 100),
      family: s.taxonomy?.family || "Unknown Family",
      care: {
        water: "Every 2-3 days",
        light: "Full sun",
        soil: "Well-draining",
        temp: "20-35°C",
        toxic: "Safe",
      },
    };

    console.log(
      `AI → ${plant.commonName} (${plant.scientificName}) ${plant.confidence}%`
    );
    res.json({ plant });
  } catch (err) {
    console.error("AI ERROR:", err.message);
    res.status(500).json({ error: "Server busy, please try again!" });
  }
});

// ===================== API: ADD TO GARDEN =====================
app.post(
  "/api/add-to-garden",
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      await connectDB();

      const { plant } = req.body;
      const user = await User.findById(req.user._id);

      if (!plant) {
        return res.status(400).json({ error: "Plant data required" });
      }

      // Calculate next watering date
      const wateringDays = extractWateringDays(plant.care?.water);
      const nextWatering = new Date(
        Date.now() + wateringDays * 24 * 60 * 60 * 1000
      );

      // Save plant to garden
      const gardenEntry = new Garden({
        userId: user._id,
        commonName: plant.commonName,
        scientificName: plant.scientificName,
        confidence: plant.confidence,
        family: plant.family,
        care: plant.care,
        nextWatering,
      });
      await gardenEntry.save();

      // Update user stats
      await User.findByIdAndUpdate(user._id, {
        $inc: { totalPlants: 1 },
        $push: {
          recentActivity: {
            $each: [
              { text: `Added ${plant.commonName} to garden`, time: new Date() },
            ],
            $slice: -10,
          },
        },
      });

      // Send confirmation email
      try {
        await transporter.sendMail({
          from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: `Added to Your Garden: ${plant.commonName}`,
          html: getGardenAddEmail(plant, user.name),
          text: convert(getGardenAddEmail(plant, user.name)),
        });
      } catch (emailErr) {
        console.error("Garden Email Error:", emailErr);
      }

      res.json({ success: true, nextWatering });
    } catch (err) {
      console.error("Add to Garden Error:", err);
      res.status(500).json({ error: "Failed to add plant to garden" });
    }
  }
);

// ===================== API: GET GARDEN =====================
app.get("/api/garden", requireAuth, requireVerified, async (req, res) => {
  try {
    await connectDB();

    const plants = await Garden.find({ userId: req.user._id }).sort({
      addedAt: -1,
    });
    res.json({ plants });
  } catch (err) {
    console.error("Get Garden Error:", err);
    res.status(500).json({ error: "Failed to load garden" });
  }
});

// ===================== API: DELETE FROM GARDEN =====================
app.delete(
  "/api/garden/:id",
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      await connectDB();

      const result = await Garden.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id,
      });

      if (!result) {
        return res.status(404).json({ error: "Plant not found" });
      }

      await User.findByIdAndUpdate(req.user._id, {
        $inc: { totalPlants: -1 },
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Delete from Garden Error:", err);
      res.status(500).json({ error: "Failed to remove plant" });
    }
  }
);

// ===================== API: MARK PLANT WATERED =====================
app.post(
  "/api/garden/:id/water",
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      await connectDB();

      const plant = await Garden.findOne({
        _id: req.params.id,
        userId: req.user._id,
      });

      if (!plant) {
        return res.status(404).json({ error: "Plant not found" });
      }

      const wateringDays = extractWateringDays(plant.care?.water);
      const nextWatering = new Date(
        Date.now() + wateringDays * 24 * 60 * 60 * 1000
      );

      plant.lastWatered = new Date();
      plant.nextWatering = nextWatering;
      await plant.save();

      await User.findByIdAndUpdate(req.user._id, {
        $inc: { tasksCompleted: 1 },
      });

      res.json({ success: true, nextWatering });
    } catch (err) {
      console.error("Water Plant Error:", err);
      res.status(500).json({ error: "Failed to update watering" });
    }
  }
);

// ===================== API: GET WATERING REMINDERS (FOR CRON) =====================
app.get("/api/cron/watering-reminders", async (req, res) => {
  // Verify cron secret to prevent unauthorized access
  const cronSecret = req.headers["x-cron-secret"];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await connectDB();

    const now = new Date();
    const plantsToWater = await Garden.find({
      nextWatering: { $lte: now },
    }).populate("userId", "name email notifications");

    let sent = 0;
    for (const plant of plantsToWater) {
      if (plant.userId && plant.userId.notifications) {
        try {
          await transporter.sendMail({
            from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
            to: plant.userId.email,
            subject: `Time to Water: ${plant.commonName}`,
            html: getWateringReminderEmail(plant, plant.userId.name),
            text: convert(getWateringReminderEmail(plant, plant.userId.name)),
          });
          sent++;
        } catch (emailErr) {
          console.error(
            `Failed to send reminder to ${plant.userId.email}:`,
            emailErr
          );
        }
      }
    }

    res.json({ success: true, remindersSent: sent });
  } catch (err) {
    console.error("Cron Error:", err);
    res.status(500).json({ error: "Cron job failed" });
  }
});

// ===================== API: CHECK AUTH STATUS =====================
app.get("/api/auth/status", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      verified: req.user.verified,
      user: {
        name: req.user.name,
        email: req.user.email,
        photo: req.user.photo,
      },
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ===================== 404 HANDLER =====================
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.status(404).sendFile(path.join(__dirname, "view", "index.html"));
});

// ===================== ERROR HANDLER =====================
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  if (req.path.startsWith("/api/")) {
    return res.status(500).json({ error: "Internal server error" });
  }
  res.status(500).send("Something went wrong!");
});

// ===================== START SERVER (LOCAL ONLY) =====================
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🌱 LIVE → http://localhost:${PORT}`);
    console.log(
      `📧 Email: ${process.env.EMAIL_USER ? "Configured" : "Missing"}`
    );
    console.log(
      `🔑 Plant.ID: ${process.env.PLANT_ID_API_KEY ? "Configured" : "Missing"}`
    );
  });
}

// ===================== EXPORT FOR VERCEL =====================
module.exports = app;
