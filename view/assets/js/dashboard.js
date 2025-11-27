/* ==================== DROPDOWN & THEME ==================== */
function toggleDropdown() {
  document.getElementById("dropdownMenu").classList.toggle("active");
}
document.addEventListener("click", (e) => {
  const d = document.querySelector(".profile-dropdown");
  if (d && !d.contains(e.target)) {
    document.getElementById("dropdownMenu").classList.remove("active");
  }
});

function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  const i = document.querySelector(".theme-toggle i");
  i.classList.toggle("fa-moon");
  i.classList.toggle("fa-sun");
}

/* ==================== DYNAMIC COUNTERS ==================== */
async function loadDashboardStats() {
  try {
    const response = await fetch('/api/dashboard-stats', {
      credentials: 'include'
    });

    let stats = {};

    if (response && response.ok) {
      stats = await response.json();
    } else {
      throw new Error("API not available");
    }

    // Use real data
    updateCounter('total-plants', stats.totalPlants ?? 0);
    updateCounter('watering-tasks', stats.wateringTasks ?? 0);
    updateCounter('sunlight-hours', stats.sunlightHours ?? 0);
    updateCounter('health-index', stats.healthIndex ?? 0);

  } catch (err) {
    console.warn("Using mock data (backend not ready)", err);

    // Realistic mock data with slight randomness
    const mock = {
      totalPlants: 3,     // 22–29
      wateringTasks: 7,    // 3–7
      sunlightHours: 13,   // 6.0–8.0
      healthIndex: 90      // 89–96
    };

    updateCounter('total-plants', mock.totalPlants);
    updateCounter('watering-tasks', mock.wateringTasks);
    updateCounter('sunlight-hours', parseFloat(mock.sunlightHours));
    updateCounter('health-index', mock.healthIndex);
  }
}

function updateCounter(className, target) {
  const el = document.querySelector(`.card-value.${className}`);
  if (!el) return;
  el.dataset.target = target;
  el.textContent = '0';
  animateCounter(el);
}

function animateCounter(el) {
  const target = parseFloat(el.dataset.target) || 0;
  const isInteger = Number.isInteger(target);
  const duration = 1800; // ms
  const steps = 90;
  const increment = target / steps;
  let current = 0;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      clearInterval(timer);
      el.textContent = isInteger ? Math.round(target) : target.toFixed(1);
    } else {
      el.textContent = isInteger ? Math.floor(current) : current.toFixed(1);
    }
  }, duration / steps);
}

/* ==================== CHARTS ==================== */
document.addEventListener('DOMContentLoaded', () => {
  // Always start counters at 0
  document.querySelectorAll('.card-value').forEach(el => el.textContent = '0');

  // Load real or mock stats
  loadDashboardStats();

  // Charts
  new Chart(document.getElementById("growthChart"), {
    type: "line",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
      datasets: [{
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
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
    }
  });

  new Chart(document.getElementById("categoryChart"), {
    type: "doughnut",
    data: {
      labels: ["Succulents", "Ferns", "Flowering", "Indoor Trees", "Herbs"],
      datasets: [{
        data: [8, 6, 5, 3, 2],
        backgroundColor: ["#66bb6a","#42a5f5","#ffa726","#ef5350","#ab47bc"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } }
    }
  });

  // Task checkboxes
  document.querySelectorAll(".task-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const item = cb.closest(".task-item");
      const badge = item.querySelector(".task-status");
      if (cb.checked) {
        badge.textContent = "Completed";
        badge.className = "task-status status-completed";
      } else {
        badge.textContent = "Pending";
        badge.className = "task-status status-pending";
      }
    });
  });

  // Action buttons
  document.querySelector(".add-task-btn").addEventListener("click", () => alert("Add task form coming soon!"));
  document.querySelectorAll(".action-btn.delete").forEach(b => {
    b.addEventListener("click", () => {
      if (confirm("Delete this task?")) b.closest(".task-item").remove();
    });
  });
});

/* ==================== PROFILE ==================== */
async function loadProfile() {
  try {
    const r = await fetch("/api/profile", { credentials: "include" });
    if (!r.ok) throw new Error("unauth");
    const u = await r.json();
    const pic = document.getElementById("profilePic");
    pic.src = u.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=66bb6a&color=fff&bold=true`;
    pic.alt = u.name;
  } catch (e) {
    console.warn("Not logged in, redirecting...");
    // location.href = "/login";
  }
}
loadProfile();