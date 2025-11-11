      /* ==================== TAB SWITCHING ==================== */
      document.getElementById("loginTab").onclick = () => switchForm("login");
      document.getElementById("signupTab").onclick = () => switchForm("signup");
      document.getElementById("switchToSignup").onclick = (e) => {
        e.preventDefault();
        switchForm("signup");
      };
      document.getElementById("switchToLogin").onclick = (e) => {
        e.preventDefault();
        switchForm("login");
      };

      function switchForm(type) {
        document
          .querySelectorAll(".tab-btn")
          .forEach((b) => b.classList.remove("active"));
        document
          .querySelectorAll(".form-content")
          .forEach((f) => f.classList.remove("active"));
        if (type === "login" || type === "signup") {
          document.getElementById(type + "Tab").classList.add("active");
        }
        document.getElementById(type + "Content").classList.add("active");
      }

      /* ==================== PASSWORD TOGGLE ==================== */
      ["login", "signup", "confirm"].forEach((id) => {
        const btn = document.getElementById(id + "PasswordToggle");
        if (btn) {
          btn.onclick = () => {
            const inputId =
              id === "confirm" ? "confirmPassword" : id + "Password";
            const input = document.getElementById(inputId);
            const isPass = input.type === "password";
            input.type = isPass ? "text" : "password";
            btn.textContent = isPass ? "Hidden" : "Eye";
          };
        }
      });

      /* ==================== OTP INPUT AUTO-FOCUS ==================== */
      const otpInputs = document.querySelectorAll(".otp-digit");
      otpInputs.forEach((input, idx) => {
        input.addEventListener("input", () => {
          if (input.value.length === 1 && idx < 5) {
            otpInputs[idx + 1].focus();
          }
          if (input.value.length > 1) input.value = input.value.slice(0, 1);
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Backspace" && input.value === "" && idx > 0) {
            otpInputs[idx - 1].focus();
          }
        });
      });

      /* ==================== HELPERS ==================== */
      function clearErrors(formId) {
        const form = document.getElementById(formId);
        if (!form) return;
        form
          .querySelectorAll(".input-group")
          .forEach((g) => g.classList.remove("error"));
        form.querySelectorAll(".error-message").forEach((e) => {
          e.classList.remove("show");
          e.textContent = "";
        });
        form.querySelectorAll(".otp-digit").forEach((i) => {
          i.style.borderColor = "";
        });
      }
      function showError(fieldId, msg) {
        const grp = document
          .querySelector("#" + fieldId)
          .closest(".input-group");
        if (grp) {
          grp.classList.add("error");
          const err = grp.querySelector(".error-message");
          err.textContent = msg;
          err.classList.add("show");
        }
      }
      function showOtpError(msg) {
        const err = document.getElementById("otpError");
        err.textContent = msg;
        err.classList.add("show");
        otpInputs.forEach((i) => (i.style.borderColor = "#e53e3e"));
      }
      function showToast(msg, isError = false) {
        const toast = document.getElementById("toast");
        const txt = document.getElementById("toastMessage");
        txt.textContent = msg;
        toast.style.background = isError ? "#fee2e2" : "#fff";
        toast.style.color = isError ? "#b91c1c" : "#1A5F3A";
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
      }

      /* ==================== LOGIN ==================== */
      document.getElementById("loginForm").onsubmit = async (e) => {
        e.preventDefault();
        clearErrors("loginForm");
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const btn = e.target.querySelector(".submit-btn");
        btn.classList.add("loading");

        try {
          const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            credentials: "include",
          });
          const data = await res.json();
          if (data.success) {
            if (data.redirect === "/verify-otp") {
              // If server says go to OTP (for unverified returning users)
              document.getElementById("otpEmailDisplay").textContent = email;
              switchForm("otp");
              showToast("Please verify your email with the OTP");
            } else {
              showToast("Welcome back!");
              setTimeout(
                () => (location.href = data.redirect || "/dashboard"),
                800
              );
            }
          } else {
            showToast(data.error || "Login failed", true);
          }
        } catch (err) {
          showToast("Network error", true);
        } finally {
          btn.classList.remove("loading");
        }
      };

      /* ==================== SIGNUP ==================== */
      document.getElementById("signupForm").onsubmit = async (e) => {
        e.preventDefault();
        clearErrors("signupForm");

        const name = document.getElementById("signupName").value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;
        const confirm = document.getElementById("confirmPassword").value;

        if (!name) return showError("signupName", "Name required");
        if (!email) return showError("signupEmail", "Email required");
        if (password.length < 6)
          return showError("signupPassword", "Min 6 characters");
        if (password !== confirm)
          return showError("confirmPassword", "Passwords don’t match");

        const btn = e.target.querySelector(".submit-btn");
        btn.classList.add("loading");

        try {
          const res = await fetch("/api/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
            credentials: "include",
          });
          const data = await res.json();
          if (data.success) {
            // Show OTP section
            document.getElementById("otpEmailDisplay").textContent = email;
            switchForm("otp");
            otpInputs[0].focus();
            clearOtpFields();
            showToast("Check your email for the OTP!");
          } else {
            showToast(data.error || "Signup failed", true);
          }
        } catch (err) {
          showToast("Network error", true);
        } finally {
          btn.classList.remove("loading");
        }
      };

      /* ==================== OTP VERIFICATION ==================== */
      function clearOtpFields() {
        otpInputs.forEach((i) => (i.value = ""));
        document.getElementById("otpError").classList.remove("show");
        otpInputs.forEach((i) => (i.style.borderColor = ""));
      }

      document.getElementById("otpForm").onsubmit = async (e) => {
        e.preventDefault();
        clearErrors("otpForm");
        const otp = Array.from(otpInputs)
          .map((i) => i.value)
          .join("");
        if (otp.length !== 6 || !/^\d+$/.test(otp)) {
          return showOtpError("Enter a valid 6-digit code");
        }

        const btn = e.target.querySelector(".submit-btn");
        btn.classList.add("loading");

        try {
          const res = await fetch("/api/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ otp }),
            credentials: "include",
          });
          const data = await res.json();
          if (data.success) {
            showToast("Email verified! Welcome 🌱");
            setTimeout(
              () => (location.href = data.redirect || "/dashboard"),
              1000
            );
          } else {
            showOtpError(data.error || "Invalid OTP");
          }
        } catch (err) {
          showOtpError("Network error");
        } finally {
          btn.classList.remove("loading");
        }
      };

      // Resend OTP
      document.getElementById("resendOtp").onclick = async () => {
        showToast("Resending OTP...");
        try {
          const res = await fetch("/api/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: document.getElementById("signupName").value.trim(),
              email: document.getElementById("otpEmailDisplay").textContent,
              password: document.getElementById("signupPassword").value,
            }),
            credentials: "include",
          });
          const data = await res.json();
          if (data.success) {
            showToast("New OTP sent!");
            clearOtpFields();
            otpInputs[0].focus();
          } else {
            showToast(data.error || "Resend failed", true);
          }
        } catch (err) {
          showToast("Network error", true);
        }
      };

      // Back to signup (change email)
      document.getElementById("backToSignup").onclick = (e) => {
        e.preventDefault();
        switchForm("signup");
      };

      // On page load – check if we need OTP (e.g., direct navigation)
      window.addEventListener("load", async () => {
        try {
          const res = await fetch("/api/profile", { credentials: "include" });
          const data = await res.json();
          if (res.ok && !data.verified) {
            // User logged in but not verified
            document.getElementById("otpEmailDisplay").textContent =
              data.email || "";
            switchForm("otp");
          }
        } catch (_) {}
      });