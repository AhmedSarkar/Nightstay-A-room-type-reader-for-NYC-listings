// Point this at wherever your FastAPI server is running.
const API_BASE = "https://nightstay-a-room-type-reader-for-nyc.onrender.com";

// ---------- Ambient city-lights canvas ----------
(function cityMap() {
  const canvas = document.getElementById("citymap");
  const ctx = canvas.getContext("2d");
  let w, h, dots = [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.round((w * h) / 14000);
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.4 + 0.4,
      base: Math.random() * 0.35 + 0.08,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.4 + 0.15,
    }));
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      const flicker = reduceMotion ? d.base : d.base + Math.sin(t * 0.001 * d.speed + d.phase) * 0.12;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(227, 169, 85, ${Math.max(flicker, 0.03)})`;
      ctx.fill();
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
})();

// ---------- Slider live readouts ----------
const sliderIds = [
  "price", "minimum_nights", "availability_365",
  "number_of_reviews", "reviews_per_month", "calculated_host_listings_count",
];

sliderIds.forEach((id) => {
  const input = document.getElementById(id);
  const out = document.getElementById(id + "_out");
  const format = (v) => (id === "reviews_per_month" ? parseFloat(v).toFixed(1) : v);
  out.textContent = format(input.value);
  input.addEventListener("input", () => { out.textContent = format(input.value); });
});

// ---------- Neighbourhood suggestions per borough ----------
const NEIGHBOURHOODS = {
  Manhattan: ["Harlem", "Upper West Side", "Upper East Side", "East Village", "West Village", "Chelsea", "Hell's Kitchen", "Financial District", "Chinatown", "Washington Heights"],
  Brooklyn: ["Williamsburg", "Bushwick", "Bedford-Stuyvesant", "Park Slope", "Greenpoint", "Crown Heights", "Flatbush", "DUMBO", "Sunset Park", "Bay Ridge"],
  Queens: ["Astoria", "Long Island City", "Flushing", "Ridgewood", "Jamaica", "Forest Hills", "Sunnyside", "Elmhurst"],
  Bronx: ["Riverdale", "Mott Haven", "Fordham", "Kingsbridge", "Concourse", "Pelham Bay"],
  "Staten Island": ["St. George", "Tompkinsville", "Stapleton", "New Brighton", "Great Kills"],
};

const groupSelect = document.getElementById("neighbourhood_group");
const neighbourhoodInput = document.getElementById("neighbourhood");
const datalist = document.getElementById("neighbourhoodList");

groupSelect.addEventListener("change", () => {
  const options = NEIGHBOURHOODS[groupSelect.value] || [];
  datalist.innerHTML = options.map((n) => `<option value="${n}"></option>`).join("");
});

// ---------- Example filler ----------
const EXAMPLES = [
  { latitude: 40.7081, longitude: -73.9571, price: 175, minimum_nights: 3, availability_365: 210, number_of_reviews: 84, reviews_per_month: 2.3, calculated_host_listings_count: 1, neighbourhood_group: "Brooklyn", neighbourhood: "Williamsburg" },
  { latitude: 40.7736, longitude: -73.9566, price: 95, minimum_nights: 30, availability_365: 40, number_of_reviews: 12, reviews_per_month: 0.6, calculated_host_listings_count: 4, neighbourhood_group: "Manhattan", neighbourhood: "Upper East Side" },
  { latitude: 40.7580, longitude: -73.9155, price: 42, minimum_nights: 1, availability_365: 300, number_of_reviews: 210, reviews_per_month: 5.1, calculated_host_listings_count: 12, neighbourhood_group: "Queens", neighbourhood: "Astoria" },
];

document.getElementById("fillExample").addEventListener("click", () => {
  const ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
  document.getElementById("latitude").value = ex.latitude;
  document.getElementById("longitude").value = ex.longitude;
  groupSelect.value = ex.neighbourhood_group;
  groupSelect.dispatchEvent(new Event("change"));
  neighbourhoodInput.value = ex.neighbourhood;

  Object.entries(ex).forEach(([key, val]) => {
    if (sliderIds.includes(key)) {
      const el = document.getElementById(key);
      el.value = val;
      el.dispatchEvent(new Event("input"));
      el.parentElement.animate(
        [{ backgroundColor: "rgba(227,169,85,0.12)" }, { backgroundColor: "transparent" }],
        { duration: 700, easing: "ease-out" }
      );
    }
  });
});

// ---------- Submit + predict ----------
const form = document.getElementById("predictForm");
const submitBtn = document.getElementById("submitBtn");
const errorBanner = document.getElementById("errorBanner");
const heroCopy = document.getElementById("heroCopy");
const resultCard = document.getElementById("resultCard");
const resultTitle = document.getElementById("resultTitle");
const resultConfidence = document.getElementById("resultConfidence");
const barsEl = document.getElementById("bars");

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

function readPayload() {
  return {
    latitude: parseFloat(document.getElementById("latitude").value),
    longitude: parseFloat(document.getElementById("longitude").value),
    price: parseFloat(document.getElementById("price").value),
    minimum_nights: parseInt(document.getElementById("minimum_nights").value, 10),
    number_of_reviews: parseInt(document.getElementById("number_of_reviews").value, 10),
    reviews_per_month: parseFloat(document.getElementById("reviews_per_month").value),
    calculated_host_listings_count: parseInt(document.getElementById("calculated_host_listings_count").value, 10),
    availability_365: parseInt(document.getElementById("availability_365").value, 10),
    neighbourhood_group: groupSelect.value,
    neighbourhood: neighbourhoodInput.value.trim(),
  };
}

function validate(payload) {
  if (!payload.neighbourhood_group) return "Choose a borough.";
  if (!payload.neighbourhood) return "Enter a neighbourhood.";
  if (Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude)) return "Latitude and longitude are required.";
  if (payload.latitude < -90 || payload.latitude > 90) return "Latitude must be between -90 and 90.";
  if (payload.longitude < -180 || payload.longitude > 180) return "Longitude must be between -180 and 180.";
  if (payload.price <= 0) return "Price must be greater than 0.";
  return null;
}

function renderResult(data) {
  const labels = data.classes && data.classes.length === data.Probablity.length
    ? data.classes
    : data.Probablity.map((_, i) => `Class ${i + 1}`);

  const rows = labels.map((label, i) => ({ label, pct: data.Probablity[i] }));
  rows.sort((a, b) => b.pct - a.pct);

  resultTitle.textContent = data.Predicted_room_type;
  resultConfidence.textContent = `${Math.round(rows[0].pct * 100)}% confident, based on the details you gave`;

  barsEl.innerHTML = rows.map((row, i) => `
    <div class="bar-row ${i === 0 ? "top" : ""}">
      <div class="bar-top">
        <span class="bar-name">${row.label}</span>
        <span class="bar-pct">${Math.round(row.pct * 100)}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" data-pct="${row.pct * 100}"></div></div>
    </div>
  `).join("");

  heroCopy.hidden = true;
  resultCard.hidden = false;

  requestAnimationFrame(() => {
    barsEl.querySelectorAll(".bar-fill").forEach((el) => {
      el.style.width = el.dataset.pct + "%";
    });
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const payload = readPayload();
  const validationError = validate(payload);
  if (validationError) {
    showError(validationError);
    return;
  }

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.detail || `The API responded with status ${res.status}.`);
    }

    const data = await res.json();
    renderResult(data);
  } catch (err) {
    showError(
      err.message?.includes("fetch")
        ? "Couldn't reach the model API. Make sure the FastAPI server is running."
        : err.message
    );
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
});

document.getElementById("predictAgain").addEventListener("click", () => {
  resultCard.hidden = true;
  heroCopy.hidden = false;
});

// ---------- API connection indicator ----------
const apiStatus = document.getElementById("apiStatus");
fetch(`${API_BASE}/`)
  .then((res) => {
    if (!res.ok) throw new Error();
    apiStatus.innerHTML = `<span class="ok">Connected to the model API at ${API_BASE}</span>`;
  })
  .catch(() => {
    apiStatus.innerHTML = `<span class="err">Model API not reachable at ${API_BASE} &mdash; start the FastAPI server first.</span>`;
  });
