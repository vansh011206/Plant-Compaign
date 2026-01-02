require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MongoStore = require("connect-mongo"); // Added for production
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

// ===================== APP =====================
const app = express();
const PORT = process.env.PORT || 5000;

// ===================== STATIC FILES =====================
app.use(express.static(path.join(__dirname, "view")));
app.use("/uploads", express.static(path.join(__dirname, "view", "uploads")));

// ===================== MIDDLEWARES =====================
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
    origin: process.env.BASE_URL,
    credentials: true
}));

// ===================== SESSION with MongoStore (No more MemoryStore warning) =====================
app.use(session({
    secret: process.env.SESSION_SECRET || "plantcare-secret-2025",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: "sessions",
        ttl: 24 * 60 * 60 // 24 hours
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
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

// ===================== EMAIL TEMPLATES (unchanged) =====================
// ... (getOTPEmailTemplate, getGardenAddEmail, getWateringReminderEmail same as before)

// ===================== PUBLIC PAGES =====================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "view", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "view", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "view", "signup.html")));
app.get("/verify-otp", requireAuth, (req, res) => res.sendFile(path.join(__dirname, "view", "verify-otp.html")));

// ===================== SIGNUP (Direct redirect after OTP sent) =====================
app.post("/api/signup", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).send("All fields are required");
    }

    if (await User.findOne({ email })) {
        return res.status(400).send("Email already exists");
    }

    try {
        const hashed = await bcrypt.hash(password, 12);
        const otp = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = Date.now() + 10 * 60 * 1000;

        const user = new User({
            name,
            email,
            password: hashed,
            photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=66bb6a&color=fff`
        });
        await user.save();

        otpStore.set(email, { otp, expiry: otpExpiry });

        await transporter.sendMail({
            from: `"PlantCare AI" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Your OTP: ${otp} - Verify PlantCare AI Account`,
            html: getOTPEmailTemplate(name, otp),
            text: convert(getOTPEmailTemplate(name, otp))
        });

        console.log(`OTP sent to ${email}`);

        req.login(user, (err) => {
            if (err) return res.status(500).send("Signup successful but auto-login failed");
            res.redirect("/verify-otp");
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// ===================== VERIFY OTP (Direct redirect to dashboard) =====================
app.post("/api/verify-otp", requireAuth, async (req, res) => {
    const { otp } = req.body;
    const email = req.user.email;
    const stored = otpStore.get(email);

    if (!stored || stored.expiry < Date.now()) {
        return res.status(400).send("OTP expired or invalid");
    }

    if (stored.otp !== otp.trim()) {
        return res.status(400).send("Wrong OTP");
    }

    await User.updateOne({ _id: req.user._id }, { verified: true });
    otpStore.delete(email);

    res.redirect("/dashboard");
});

// ===================== LOGIN (Direct redirect) =====================
app.post("/api/login", passport.authenticate("local", {
    failureRedirect: "/login?error=invalid",
    failureFlash: false
}), (req, res) => {
    if (req.user.verified) {
        res.redirect("/dashboard");
    } else {
        res.redirect("/verify-otp");
    }
});

// ===================== PROFILE UPDATE (Direct redirect back to profile) =====================
app.post("/api/profile", requireAuth, requireVerified, async (req, res) => {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;
    if (req.body.location !== undefined) updates.location = req.body.location;
    if (req.body.darkMode !== undefined) updates.darkMode = req.body.darkMode;
    if (req.body.notifications !== undefined) updates.notifications = req.body.notifications;
    if (req.body.weeklySummary !== undefined) updates.weeklySummary = req.body.weeklySummary;

    // Note: File upload ke liye multer ya express-fileupload add karna padega
    // Abhi sirf text updates

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
    res.redirect("/profile");
});

// ===================== ADD TO GARDEN (Direct redirect back to examine or dashboard) =====================
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

        res.redirect("/examine"); // Ya "/dashboard" jo bhi chahte ho
    } catch (err) {
        console.error(err);
        res.redirect("/examine?error=emailfailed");
    }
});

// ===================== LOGOUT =====================
app.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) console.error(err);
        req.session.destroy(() => {
            res.redirect("/login");
        });
    });
});

// ===================== PLANT IDENTIFICATION (JSON - yeh fetch se hi rahega) =====================
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

        res.json({ plant });
    } catch (err) {
        console.error("AI ERROR:", err);
        res.status(500).json({ error: "Server busy, try again!" });
    }
});

// ===================== PROTECTED PAGES =====================
app.get(["/dashboard", "/examine", "/profile", "/calendar", "/contact"], requireAuth, requireVerified, (req, res) => {
    const file = req.path === "/dashboard" ? "dashboard.html" : req.path.slice(1) + ".html";
    res.sendFile(path.join(__dirname, "view", file));
});

process.on('SIGINT', () => {
    console.log("Shutting down...");
    reminders.forEach(r => clearTimeout(r.timeout));
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});