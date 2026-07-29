"use strict";

const PROPERTY_DATA_URL = "data/properties.json";
const COUNTY_DATA_URL = "data/counties.json";
let properties = [];
let counties = {};
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
  queue.innerHTML = properties.slice().sort((a, b) => b.score - a.score).map(property => `
    <button class="queue-item ${property.id === activePropertyId ? "active" : ""}" data-property-id="${property.id}">
      <span class="queue-status ${verdictClass(property.verdict)}"></span>
      <span class="queue-copy"><strong>${property.codename}</strong><small>${property.county} County · ${property.acres} acres · ${formatCurrency(property.price)}</small></span>
      <span class="queue-score">${property.score}</span>
    </button>
  `).join("");
  queue.querySelectorAll(".queue-item").forEach(button => button.addEventListener("click", () => selectProperty(button.dataset.propertyId)));
}

function renderCountyIntelligence(property) {
  const county = counties[property.county];
  const panel = document.getElementById("county-intelligence");
  if (!county) {
    panel.innerHTML = `<div class="county-head"><div><div class="eyebrow">County intelligence</div><h2>${property.county} County profile pending</h2></div><span class="county-badge">RESEARCH PENDING</span></div><div class="county-note">No county profile has been added yet. Property zoning remains unverified.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="county-head">
      <div><div class="eyebrow">County intelligence</div><h2>${county.name}</h2><small>Official-source profile last verified ${county.lastVerified}</small></div>
      <span class="county-badge">OFFICIAL SOURCES</span>
    </div>
    <div class="county-grid">
      <div class="county-card">
        <h3>Planning & zoning</h3>
        <p><strong>Phone:</strong> ${county.planningPhone}</p>
        <p><strong>Email:</strong> ${county.planningEmail}</p>
        <p><strong>Hours:</strong> ${county.planningHours}</p>
        <p><strong>Office:</strong> ${county.planningAddress}</p>
      </div>
      <div class="county-card">
        <h3>Research tools</h3>
        <p>${county.intelligenceStatus}</p>
        <div class="county-links">
          <a class="county-link" href="${county.gisUrl}" target="_blank" rel="noopener">GIS / LAND USE</a>
          <a class="county-link" href="${county.propertySearchUrl}" target="_blank" rel="noopener">PROPERTY SEARCH</a>
          <a class="county-link" href="${county.landDevelopmentCodeUrl}" target="_blank" rel="noopener">LAND CODE</a>
          <a class="county-link" href="${county.comprehensivePlanUrl}" target="_blank" rel="noopener">COMP PLAN</a>
          <a class="county-link" href="${county.zoningDeterminationUrl}" target="_blank" rel="noopener">VERIFY ZONING</a>
        </div>
      </div>
    </div>
    <div class="county-note"><strong>Reality Check:</strong> ${county.verificationNote}</div>
  `;
}

function renderProperty(property) {
  activePropertyId = property.id;
  renderQueue();
  renderCountyIntelligence(property);
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
  document.querySelector(".flags").innerHTML = `<h3>Dream killers — verify before falling in love</h3>${property.criticalDueDiligence.map(item => `<div class="flag"><i class="dot ${severityClass(item.severity)}"></i><span>${item.text}</span></div>`).join("")}`;
  const actionLinks = document.querySelectorAll(".actions a");
  actionLinks[0].href = property.links.listing;
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
    const icon = L.divIcon({className: "custom-pin", html: `<div class="pin"><span>${property.score}</span></div>`, iconSize: [48, 48], iconAnchor: [24, 46]});
    const marker = L.marker([property.latitude, property.longitude], { icon }).addTo(window.joeVisionMap);
    marker.bindPopup(`<strong>${property.codename}</strong><br>${property.name}<br>${formatCurrency(property.price)} · ${property.acres} acres<br><em>${property.locationAccuracy}</em>`);
    marker.on("click", () => selectProperty(property.id));
    markers.set(property.id, marker);
    bounds.push([property.latitude, property.longitude]);
  });
  if (bounds.length > 1) window.joeVisionMap.fitBounds(bounds, { padding: [50, 50] });
}

async function initializeDashboard() {
  try {
    const [propertyResponse, countyResponse] = await Promise.all([
      fetch(PROPERTY_DATA_URL, { cache: "no-store" }),
      fetch(COUNTY_DATA_URL, { cache: "no-store" })
    ]);
    if (!propertyResponse.ok) throw new Error(`Property database returned HTTP ${propertyResponse.status}.`);
    if (!countyResponse.ok) throw new Error(`County database returned HTTP ${countyResponse.status}.`);
    const propertyData = await propertyResponse.json();
    const countyData = await countyResponse.json();
    properties = propertyData.properties || [];
    counties = countyData.counties || {};
    if (!properties.length) throw new Error("No properties found in the database.");
    renderMetrics(propertyData);
    addMarkers();
    selectProperty(properties.slice().sort((a, b) => b.score - a.score)[0].id);
  } catch (error) {
    console.error("JOE VISION initialization failed:", error);
    document.querySelector(".status").innerHTML = '<i class="dot red"></i> INTELLIGENCE DATABASE OFFLINE';
    document.querySelector(".verdict").innerHTML = `<strong>Dashboard error:</strong> ${error.message}`;
  }
}

window.joeVisionMap = L.map("map", { zoomControl: false, scrollWheelZoom: true }).setView([29.05, -82.52], 8);
L.control.zoom({ position: "bottomright" }).addTo(window.joeVisionMap);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(window.joeVisionMap);
initializeDashboard();