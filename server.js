require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { createTransport } = nodemailer;
const { convert } = require("html-to-text");
const crypto = require("crypto");
const MongoStore = require('connect-mongo');

// console.log("PLANT.ID KEY:", process.env.PLANT_ID_API_KEY ? "LOADED" : "MISSING");

// ===================== APP =====================
const app = express();
const PORT = 5000;

// ===================== STATIC FILES =====================
app.use(express.static(path.join(__dirname, "view")));
app.use("/uploads", express.static(path.join(__dirname, "view", "uploads")));

// ===================== MIDDLEWARES =====================
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const allowedOrigins = [
    `http://localhost:${PORT}`,
    'https://your-app-name.vercel.app',  // Replace with your Vercel URL
    /\.vercel\.app$/
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(o => o instanceof RegExp ? o.test(origin) : o === origin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true
}));

// Trust proxy for Vercel
app.set('trust proxy', 1);

// ===================== SESSION =====================
app.use(session({
    secret: process.env.SESSION_SECRET || "plantcare-secret-2025",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        ttl: 24 * 60 * 60 // 1 day
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));

// ===================== PASSPORT =====================
app.use(passport.initialize());
app.use(passport.session());

// ===================== DATABASE =====================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(() => console.log("Start MongoDB!"));

const User = mongoose.model("User", new mongoose.Schema({
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
    createdAt: { type: Date, default: Date.now }
}));

// ===================== PASSPORT CONFIG =====================
passport.use(new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return done(null, false, { message: "Wrong email or password" });
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

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
    res.redirect("/login");
};

const requireVerified = (req, res, next) => {
    if (req.user?.verified) return next();
    res.redirect("/verify-otp");
};

// ===================== EMAIL TRANSPORTER =====================
const transporter = createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ===================== IN-MEMORY OTP STORE =====================
const otpStore = new Map();

// ===================== REMINDER SCHEDULER =====================
const reminders = new Map();

function scheduleWateringReminders(email, plant) {
    const days = extractWateringDays(plant.care.water);
    if (!days) return;

    const key = `${email}-${plant.scientificName}`;
    if (reminders.has(key)) clearTimeout(reminders.get(key).timeout);

    const timeout = setTimeout(async () => {
        try {
            const user = await User.findOne({ email });
            if (!user) return;

            await transporter.sendMail({
                from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Paani Daal Do! ${plant.commonName}`,
                html: getWateringReminderEmail(plant, user.name),
                text: convert(getWateringReminderEmail(plant, user.name))
            });

            console.log(`Watering reminder sent to ${email} for ${plant.commonName}`);
            scheduleWateringReminders(email, plant);
        } catch (err) {
            console.error("Reminder failed:", err);
        }
    }, days * 24 * 60 * 60 * 1000);

    reminders.set(key, { timeout, plant });
}

function extractWateringDays(waterStr) {
    const match = waterStr.match(/every\s+(\d+(?:-\d+)?)\s+days?/i);
    if (!match) return null;
    const range = match[1];
    if (range.includes('-')) {
        const [min, max] = range.split('-').map(Number);
        return (min + max) / 2;
    }
    return parseInt(range);
}

// ===================== EMAIL TEMPLATES =====================
function getOTPEmailTemplate(name, otp) {
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
        <a href="http://localhost:5000/verify-otp" class="btn">Verify Now</a>
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
        <p><strong>${plant.commonName}</strong> has been added to your garden!</p>
        <h3 class="plant-name">${plant.commonName}</h3>
        <p class="sci-name">${plant.scientificName}</p>
        <div class="care-grid">
            <div class="care-item">
                <svg class="care-icon" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2">
                    <path d="M12 2.69L5.5 9.19L12 15.69L18.5 9.19L12 2.69Z"/>
                    <path d="M12 15.69V22.31"/>
                </svg>
                <div><strong>Water:</strong> ${plant.care.water}</div>
            </div>
            <div class="care-item">
                <svg class="care-icon" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="M12 1V3"/>
                    <path d="M12 21V23"/>
                </svg>
                <div><strong>Light:</strong> ${plant.care.light}</div>
            </div>
        </div>
        <p><em>Mai baadme remind karta rahunga, don't worry!</em></p>
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
<title>Paani Daal Do! ${plant.commonName}</title>
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
        <div class="water-drop">Water Drop</div>
        <h1 class="title">Paani Daal Do!</h1>
    </div>
    <div class="body">
        <p class="message">Hey <strong>${name}</strong>!</p>
        <p class="message">Aapka <span class="plant">${plant.commonName}</span> pyaasa hai!</p>
        <p class="message"><strong>Abhi paani daal do!</strong></p>
        <p class="message"><em>Mai baadme remind karta rahunga, don't worry, bas paani daal dena!</em></p>
    </div>
    <div class="footer">
        <p>© 2025 PlantCare AI - Your Plant Buddy</p>
    </div>
</div>
</body></html>
    `.trim();
}

// ===================== PUBLIC PAGES =====================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "view", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "view", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "view", "signup.html")));
app.get("/verify-otp", requireAuth, (req, res) => res.sendFile(path.join(__dirname, "view", "verify-otp.html")));

// ===================== SIGNUP WITH OTP EMAIL =====================
app.post("/api/signup", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "All fields required" });
    if (await User.findOne({ email })) return res.status(400).json({ error: "Email already exists" });

    const hashed = await bcrypt.hash(password, 12);
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000;

    const user = new User({
        name, email, password: hashed,
        photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=66bb6a&color=fff`
    });
    await user.save();

    otpStore.set(email, { otp, expiry: otpExpiry });

    try {
        await transporter.sendMail({
            from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Your OTP: ${otp} - Verify PlantCare AI Account`,
            html: getOTPEmailTemplate(name, otp),
            text: convert(getOTPEmailTemplate(name, otp))
        });
        console.log(`OTP Email Sent to ${email}: ${otp}`);
    } catch (err) {
        console.error("Email Error:", err);
        return res.status(500).json({ error: "Failed to send OTP. Try again." });
    }

    req.login(user, (err) => {
        if (err) return res.status(500).json({ error: "Login failed" });
        res.json({ success: true, redirect: "/verify-otp" });
    });
});

// ===================== VERIFY OTP =====================
app.post("/api/verify-otp", requireAuth, async (req, res) => {
    const { otp } = req.body;
    const email = req.user.email;
    const stored = otpStore.get(email);

    if (!stored || stored.expiry < Date.now()) {
        return res.status(400).json({ error: "OTP expired or invalid" });
    }
    if (stored.otp !== otp) {
        return res.status(400).json({ error: "Wrong OTP" });
    }

    await User.updateOne({ _id: req.user._id }, { verified: true });
    otpStore.delete(email);

    res.json({ success: true, redirect: "/dashboard" });
});

// ===================== LOGIN =====================
app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return res.status(500).json({ error: "Server error" });
        if (!user) return res.status(400).json({ error: "Wrong email or password" });
        req.logIn(user, (loginErr) => {
            if (loginErr) return res.status(500).json({ error: "Login failed" });
            res.json({ success: true, redirect: user.verified ? "/dashboard" : "/verify-otp" });
        });
    })(req, res, next);
});

// ===================== PROFILE API (FIXED) =====================
app.get("/api/profile", requireAuth, async (req, res) => {
    if (!req.user.verified) {
        return res.status(403).json({ error: "Email not verified" });
    }
    const user = await User.findById(req.user.id);
    res.json(user);
});

app.post("/api/profile", requireAuth, async (req, res) => {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;
    if (req.body.location !== undefined) updates.location = req.body.location;
    if (req.body.darkMode !== undefined) updates.darkMode = req.body.darkMode;
    if (req.body.notifications !== undefined) updates.notifications = req.body.notifications;
    if (req.body.weeklySummary !== undefined) updates.weeklySummary = req.body.weeklySummary;

    if (req.files?.avatar) {
        const avatar = req.files.avatar;
        const uploadPath = path.join(__dirname, "view", "uploads", `${Date.now()}_${avatar.name}`);
        await avatar.mv(uploadPath);
        updates.photo = `/uploads/${path.basename(uploadPath)}`;
    }

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
    res.json({ success: true, user: updatedUser });
});


app.get(["/dashboard", "/examine", "/profile", "/calendar", "/contact"], requireAuth, requireVerified, (req, res) => {
    const file = req.path === "/dashboard" ? "dashboard.html" : req.path.slice(1) + ".html";
    res.sendFile(path.join(__dirname, "view", file));
});


app.post("/api/identify-plant", async (req, res) => {
    try {
        let img = req.body.imageBase64;
        if (!img) return res.status(400).json({ error: "No image" });
        if (img.includes(",")) img = img.split(",")[1];

        const response = await fetch("https://api.plant.id/v3/identification", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Api-Key": process.env.PLANT_ID_API_KEY
            },
            body: JSON.stringify({ images: [img] })
        });

        const data = await response.json();
        if (!response.ok || !data.result?.classification?.suggestions?.[0]) {
            return res.status(400).json({ error: "Plant not detected! Try clearer photo" });
        }

        const s = data.result.classification.suggestions[0];
        let commonName = "Unknown Plant";

        if (s.common_names && s.common_names.length > 0) {
            commonName = s.common_names[0];
        } else {
            try {
                const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.name)}`);
                if (wikiRes.ok) {
                    const wiki = await wikiRes.json();
                    const extract = wiki.extract || "";
                    const match = extract.match(/commonly known as\s+([A-Za-z\s\(\)]+)/i) ||
                                  extract.match(/known as\s+([A-Za-z\s\(\)]+)/i);
                    if (match) commonName = match[1].trim();
                }
            } catch (e) { /* ignore */ }
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
                toxic: "Safe"
            }
        };

        console.log(`AI → ${plant.commonName} (${plant.scientificName}) ${plant.confidence}%`);
        res.json({ plant });
    } catch (err) {
        console.error("AI ERROR:", err.message);
        res.status(500).json({ error: "Server busy, try again!" });
    }
});
app.post("/api/add-to-garden", requireAuth, requireVerified, async (req, res) => {
    const { plant } = req.body;
    const user = await User.findById(req.user._id);

    try {
        await transporter.sendMail({
            from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: `Added to Your Garden: ${plant.commonName}`,
            html: getGardenAddEmail(plant, user.name),
            text: convert(getGardenAddEmail(plant, user.name))
        });

        scheduleWateringReminders(user.email, plant);

        res.json({ success: true });
    } catch (err) {
        console.error("Garden Email Error:", err);
        res.status(500).json({ error: "Emails failed, but plant saved." });
    }
});

app.post("/api/logout", (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.json({ success: true });
        });
    });
});


process.on('SIGINT', () => {
    console.log("Shutting down gracefully...");
    reminders.forEach(r => clearTimeout(r.timeout));
    process.exit(0);
});


app.listen(PORT, () => {
    console.log(`LIVE → http://localhost:${PORT}`);
    console.log(`LOGIN = WORKING`);
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`LIVE → http://localhost:${PORT}`);
        console.log(`LOGIN = WORKING`);
    });
}

// Export for Vercel serverless
module.exports = app;