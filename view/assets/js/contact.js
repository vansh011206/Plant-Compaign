      const form = document.getElementById("contactForm");
      const submitBtn = document.getElementById("submitBtn");
      const alert = document.getElementById("alert");
      const alertMessage = document.getElementById("alertMessage");

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Show loading
        submitBtn.classList.add("loading");
        submitBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Sending...';

        // Simulate API call
        await new Promise((r) => setTimeout(r, 1500));

        // Success
        showAlert("Thank you! Your message has been sent. We'll reply soon.");

        // Reset form
        form.reset();
        submitBtn.classList.remove("loading");
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
      });

      function showAlert(msg) {
        alertMessage.textContent = msg;
        alert.classList.add("show");
        setTimeout(() => alert.classList.remove("show"), 4000);
      }

      // Optional: Dark mode toggle (same as other pages)
      // You can remove if not needed
      const themeToggle = document.createElement("button");
      themeToggle.innerHTML = "Sun";
      themeToggle.style.cssText = `
      position: fixed; bottom: 2rem; right: 2rem; width: 50px; height: 50px;
      border-radius: 50%; background: var(--green-primary); color: white;
      border: none; font-size: 1.4rem; cursor: pointer; z-index: 1000;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s;
    `;
      themeToggle.onclick = () => {
        document.body.classList.toggle("dark-mode");
        themeToggle.innerHTML = document.body.classList.contains("dark-mode")
          ? "Moon"
          : "Sun";
      };
      document.body.appendChild(themeToggle);