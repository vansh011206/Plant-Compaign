      function toggleDropdown() {
        document.getElementById("dropdownMenu").classList.toggle("active");
      }
      document.addEventListener("click", (e) => {
        const d = document.querySelector(".profile-dropdown");
        if (!d.contains(e.target))
          document.getElementById("dropdownMenu").classList.remove("active");
      });

      /* ---- Theme --------------------------------------------------- */
      function toggleTheme() {
        document.body.classList.toggle("dark-mode");
        const i = document.querySelector(".theme-toggle i");
        i.classList.toggle("fa-moon");
        i.classList.toggle("fa-sun");
      }
     fetch('/api/profile').then(r => r.json()).then(u => {
        document.getElementById('userName').textContent = u.name;
    });

  // * ────── FIXED COUNTER (dashboard.html) ────── */
function animateCounter(el) {
  const target = parseFloat(el.dataset.target);
  const isInteger = Number.isInteger(target);
  const increment = target / 125;
  let current = 0;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      el.textContent = isInteger ? Math.round(target) : target.toFixed(1);
      clearInterval(timer);
    } else {
      const display = isInteger
        ? Math.floor(current)
        : Number(current.toFixed(1));
      el.textContent = display;
    }
  }, 16);
}

/* ────── LISTEN FOR PLANT ADDED ────── */
window.addEventListener('plantAdded', e => {
  const newTotal = e.detail.total;
  const totalEl = document.querySelector('.card-value[data-target="24"]'); // Total Plants
  if (totalEl) {
    totalEl.dataset.target = newTotal;          // update target
    totalEl.textContent = '0';                  // reset
    animateCounter(totalEl);                    // re-animate
  }
});

/* ────── INITIAL LOAD (keep your existing code) ────── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.card-value').forEach(animateCounter);
  // … your chart code …
});
      /* ---- Charts -------------------------------------------------- */
      const growthChart = new Chart(document.getElementById("growthChart"), {
        type: "line",
        data: {
          labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
          datasets: [
            {
              label: "Average Growth (cm)",
              data: [2, 3.5, 5, 7, 9.5, 12, 15],
              borderColor: "#43a047",
              backgroundColor: "rgba(67,160,71,.1)",
              borderWidth: 3,
              tension: 0.4,
              fill: true,
              pointRadius: 5,
              pointHoverRadius: 8,
              pointBackgroundColor: "#43a047",
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "bottom" } },
          scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
        },
      });
      const categoryChart = new Chart(
        document.getElementById("categoryChart"),
        {
          type: "doughnut",
          data: {
            labels: [
              "Succulents",
              "Ferns",
              "Flowering",
              "Indoor Trees",
              "Herbs",
            ],
            datasets: [
              {
                data: [8, 6, 5, 3, 2],
                backgroundColor: [
                  "#66bb6a",
                  "#42a5f5",
                  "#ffa726",
                  "#ef5350",
                  "#ab47bc",
                ],
                borderWidth: 0,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
          },
        }
      );

      /* ---- Tasks --------------------------------------------------- */
      document.querySelectorAll(".task-checkbox").forEach((cb) => {
        cb.addEventListener("change", () => {
          const item = cb.closest(".task-item"),
            badge = item.querySelector(".task-status");
          if (cb.checked) {
            badge.textContent = "Completed";
            badge.className = "task-status status-completed";
          } else {
            badge.textContent = "Pending";
            badge.className = "task-status status-pending";
          }
        });
      });
      document
        .querySelector(".add-task-btn")
        .addEventListener("click", () => alert("Connect to backend"));
      document
        .querySelectorAll(".action-btn.edit")
        .forEach((b) => b.addEventListener("click", () => alert("Edit task")));
      document.querySelectorAll(".action-btn.delete").forEach((b) =>
        b.addEventListener("click", () => {
          if (confirm("Delete?")) b.closest(".task-item").remove();
        })
      );

      /* ---- Load user profile (avatar + name) ---------------------- */
      async function loadProfile() {
        try {
          const r = await fetch("/api/profile", { credentials: "include" });
          if (!r.ok) throw new Error("unauth");
          const u = await r.json();
          const pic = document.getElementById("profilePic");
          pic.src =
            u.photo ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              u.name
            )}&background=66bb6a&color=fff`;
          pic.alt = u.name;
        } catch (e) {
          location.href = "/login";
        }
      }
      loadProfile();
      function broadcast(eventName, data) {
  const payload = JSON.stringify({ event: eventName, data, ts: Date.now() });
  localStorage.setItem('plantcare_event', payload);
  // trigger the same event in the current tab
  window.dispatchEvent(new Event('storage'));
}
window.addEventListener('storage', e => {
  if (e.key !== 'plantcare_event') return;
  try {
    const { event, data } = JSON.parse(e.newValue);
    window.dispatchEvent(new CustomEvent(event, { detail: data }));
  } catch (_) {}
});
