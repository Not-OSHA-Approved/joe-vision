"use strict";

const DATA_URL = "data/properties.json";
let properties = [];
let markers = new Map();
let activePropertyId = null;

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function severityClass(severity) {
  return severity === "critical" ? "red" : severity === "warning" ? "amber" : "green";
}

function verdictClass(verdict) {
  return verdict === "PURSUE" ? "verdict-pursue" : verdict === "PASS" ? "verdict-pass" : "verdict-investigate";
}

function buildFact(label, value) {
  return `<div class="fact"><small>${label}</small><strong>${value}</strong></div>`;
}

function renderMetrics(data) {
  const totalAcres = properties.reduce((sum, item) => sum + Number(item.acres || 0), 0);
  const totalValue = properties.reduce((sum, item) => sum + Number(item.price || 0), 0);

  document.querySelector(".metric:nth-child(1) b").textContent = String(properties.length).padStart(2, "0");
  document.querySelector(".metric:nth-child(2) b").textContent = totalAcres.toLocaleString("en-US", { maximumFractionDigits: 2 });
  document.querySelector(".metric:nth-child(3) b").textContent = totalValue >= 1000000
    ? `$${(totalValue / 1000000).toFixed(1)}M`
    : `$${Math.round(totalValue / 1000)}K`;
  document.querySelector(".metric:nth-child(4) b").textContent = data.metadata.countiesInScope;
}

function renderQueue() {
  const queue = document.getElementById("opportunity-queue");
  queue.innerHTML = properties
    .slice()
    .sort((a, b) => b.score - a.score)
    .map(property => `
      <button class="queue-item ${property.id === activePropertyId ? "active" : ""}" data-property-id="${property.id}">
        <span class="queue-status ${verdictClass(property.verdict)}"></span>
        <span class="queue-copy">
          <strong>${property.codename}${property.isSample ? " <em>TEST</em>" : ""}</strong>
          <small>${property.county} County · ${property.acres} acres · ${formatCurrency(property.price)}</small>
        </span>
        <span class="queue-score">${property.score}</span>
      </button>
    `).join("");

  queue.querySelectorAll(".queue-item").forEach(button => {
    button.addEventListener("click", () => selectProperty(button.dataset.propertyId));
  });
}

function renderProperty(property) {
  activePropertyId = property.id;
  renderQueue();

  document.querySelector(".rank span").textContent = `${property.id} · ${property.researchStage}`;
  document.querySelector(".score").textContent = property.score;
  document.querySelector(".panel h2").textContent = `${property.codename} — ${property.name}`;
  document.querySelector(".location").textContent = `${property.address} · ${property.city}, ${property.state} · ${property.county} County`;
  document.querySelector(".price").textContent = formatCurrency(property.price);
  document.querySelector(".subprice").textContent = `${property.acres} acres · approximately ${formatCurrency(Math.round(property.price / property.acres))} per acre`;
  document.querySelector(".verdict").className = `verdict ${verdictClass(property.verdict)}`;
  document.querySelector(".verdict").innerHTML = `<strong>${property.verdict}: Can we build what we want here?</strong><br>${property.summary}`;

  document.querySelector(".grid").innerHTML = [
    buildFact("Buildability", property.buildability),
    buildFact("Zoning", property.zoning),
    buildFact("Waterfront", property.waterfront),
    buildFact("Flood zone", property.floodZone),
    buildFact("Utilities", property.utilities),
    buildFact("Expansion", `${property.expansionScore}/100`)
  ].join("");

  document.querySelector(".flags").innerHTML = `
    <h3>Dream killers — verify before falling in love</h3>
    ${property.criticalDueDiligence.map(item => `
      <div class="flag"><i class="dot ${severityClass(item.severity)}"></i><span>${item.text}</span></div>
    `).join("")}
  `;

  const actionLinks = document.querySelectorAll(".actions a");
  actionLinks[0].href = property.links.listing;
  actionLinks[0].classList.toggle("disabled", property.links.listing === "#");
  actionLinks[1].href = property.links.googleMaps;

  const marker = markers.get(property.id);
  if (marker) {
    window.joeVisionMap.setView(marker.getLatLng(), 8, { animate: true });
    marker.openPopup();
  }
}

function selectProperty(propertyId) {
  const property = properties.find(item => item.id === propertyId);
  if (property) renderProperty(property);
}

function addMarkers() {
  const bounds = [];
  properties.forEach(property => {
    const icon = L.divIcon({
      className: "custom-pin",
      html: `<div class="pin ${property.isSample ? "pin-sample" : ""}"><span>${property.score}</span></div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 46]
    });

    const marker = L.marker([property.latitude, property.longitude], { icon }).addTo(window.joeVisionMap);
    marker.bindPopup(`
      <strong>${property.codename}${property.isSample ? " (TEST)" : ""}</strong><br>
      ${property.name}<br>
      ${formatCurrency(property.price)} · ${property.acres} acres<br>
      <em>${property.locationAccuracy}</em>
    `);
    marker.on("click", () => selectProperty(property.id));
    markers.set(property.id, marker);
    bounds.push([property.latitude, property.longitude]);
  });

  if (bounds.length > 1) {
    window.joeVisionMap.fitBounds(bounds, { padding: [50, 50] });
  }
}

async function initializeDashboard() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Property database returned HTTP ${response.status}.`);

    const data = await response.json();
    properties = data.properties || [];
    if (!properties.length) throw new Error("No properties found in the database.");

    renderMetrics(data);
    addMarkers();
    selectProperty(properties.slice().sort((a, b) => b.score - a.score)[0].id);
  } catch (error) {
    console.error("JOE VISION initialization failed:", error);
    document.querySelector(".status").innerHTML = '<i class="dot red"></i> PROPERTY DATABASE OFFLINE';
    document.querySelector(".verdict").innerHTML = `<strong>Dashboard error:</strong> ${error.message}`;
  }
}

window.joeVisionMap = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true
}).setView([29.05, -82.52], 8);

L.control.zoom({ position: "bottomright" }).addTo(window.joeVisionMap);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(window.joeVisionMap);

initializeDashboard();