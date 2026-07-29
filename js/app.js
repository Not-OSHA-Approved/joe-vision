"use strict";

const PROPERTY_DATA_URL = "data/properties.json";
const COUNTY_DATA_URL = "data/counties.json";
let properties = [];
let counties = {};
let markers = new Map();
let activePropertyId = null;
let openAccordionSection = "overview";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function verdictClass(verdict) {
  return verdict === "PURSUE" ? "verdict-pursue" : verdict === "PASS" ? "verdict-pass" : "verdict-investigate";
}

function calculateConfidence(verification) {
  const checks = Object.values(verification || {});
  if (!checks.length) return 0;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function statusClass(property, section) {
  const confidence = calculateConfidence(property.verification);
  if (section === "overview") return property.verdict === "PASS" ? "status-red" : property.verdict === "PURSUE" ? "status-green" : "status-amber";
  if (section === "county") return counties[property.county] ? "status-green" : "status-amber";
  if ((property.realityCheck?.dealKillers || []).length >= 2) return "status-red";
  return confidence >= 50 ? "status-green" : "status-amber";
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
  queue.innerHTML = properties.slice().sort((a, b) => b.score - a.score).map(property => {
    const confidence = calculateConfidence(property.verification);
    return `
      <button class="queue-item ${property.id === activePropertyId ? "active" : ""}" data-property-id="${property.id}">
        <span class="queue-status ${verdictClass(property.verdict)}"></span>
        <span class="queue-copy"><strong>${property.codename}</strong><small>${property.county} County · ${property.acres} acres · ${formatCurrency(property.price)}</small></span>
        <span class="queue-score-pair"><strong>${property.score}</strong><small><b>${confidence}%</b> known</small></span>
      </button>`;
  }).join("");
  queue.querySelectorAll(".queue-item").forEach(button => button.addEventListener("click", () => selectProperty(button.dataset.propertyId)));
}

function renderList(items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${(items || []).map(item => `<li>${item}</li>`).join("")}</${tag}>`;
}

function overviewContent(property) {
  const confidence = calculateConfidence(property.verification);
  return `
    <div class="overview-head">
      <div><h2>${property.codename}</h2><div class="overview-location">${property.name}<br>${property.address} · ${property.city}, ${property.state} · ${property.county} County</div></div>
      <div class="overview-score">${property.score}</div>
    </div>
    <div class="overview-price">${formatCurrency(property.price)}</div>
    <div class="overview-subprice">${property.acres} acres · approximately ${formatCurrency(Math.round(property.price / property.acres))} per acre</div>
    <div class="overview-decision"><strong>${property.verdict}: Would we spend our own money today?</strong><br>${property.moneyToday}</div>
    <div class="overview-meters"><div class="overview-meter"><small>Opportunity</small><strong>${property.score}/100</strong></div><div class="overview-meter"><small>Confidence</small><strong>${confidence}%</strong></div></div>
    <div class="compact-actions"><a class="btn primary" href="${property.links.listing}" target="_blank" rel="noopener">OPEN LISTING</a><a class="btn secondary" href="${property.links.googleMaps}" target="_blank" rel="noopener">GOOGLE MAPS</a></div>`;
}

function realityContent(property) {
  const confidence = calculateConfidence(property.verification);
  const check = property.realityCheck || { confirmed: [], unknowns: [], dealKillers: [], nextActions: [] };
  return `
    <div class="flags reality-check ${verdictClass(property.verdict)}">
      <div class="reality-header"><div><div class="reality-kicker">Reality Check</div><h3>Would we spend our own money today?</h3><div class="money-answer">${property.moneyToday}</div></div>
      <div class="reality-scores"><div><small>Opportunity</small><strong>${property.score}</strong><span>/100</span></div><div><small>Confidence</small><strong>${confidence}</strong><span>%</span></div></div></div>
      <div class="confidence-wrap"><div class="confidence-label"><span>Due diligence completed</span><strong>${confidence}%</strong></div><div class="confidence-track"><span style="width:${confidence}%"></span></div></div>
      <div class="reality-grid">
        <section class="reality-section confirmed"><h4>Confirmed</h4>${renderList(check.confirmed)}</section>
        <section class="reality-section unknowns"><h4>Unknowns</h4>${renderList(check.unknowns)}</section>
        <section class="reality-section killers"><h4>Deal Killers</h4>${renderList(check.dealKillers)}</section>
        <section class="reality-section actions-list"><h4>Next Three Actions</h4>${renderList(check.nextActions, true)}</section>
      </div>
    </div>`;
}

function countyContent(property) {
  const county = counties[property.county];
  if (!county) return `<div class="county-note-compact">${property.county} County profile has not been added yet. Zoning remains unverified.</div>`;
  return `
    <div class="county-compact">
      <div class="county-contact"><h3>${county.name} Planning & Zoning</h3><p><strong>Phone:</strong> ${county.planningPhone}</p><p><strong>Email:</strong> ${county.planningEmail}</p><p><strong>Hours:</strong> ${county.planningHours}</p><p><strong>Office:</strong> ${county.planningAddress}</p></div>
      <div class="county-links-compact"><a href="${county.gisUrl}" target="_blank" rel="noopener">GIS / LAND USE</a><a href="${county.propertySearchUrl}" target="_blank" rel="noopener">PROPERTY SEARCH</a><a href="${county.landDevelopmentCodeUrl}" target="_blank" rel="noopener">LAND CODE</a><a href="${county.comprehensivePlanUrl}" target="_blank" rel="noopener">COMP PLAN</a><a href="${county.zoningDeterminationUrl}" target="_blank" rel="noopener">VERIFY ZONING</a></div>
      <div class="county-note-compact"><strong>Official-source profile last verified ${county.lastVerified}.</strong><br>${county.verificationNote}</div>
    </div>`;
}

function detailsContent(property) {
  return `
    <div class="compact-facts">
      <div class="compact-fact"><small>Research stage</small><strong>${property.researchStage}</strong></div>
      <div class="compact-fact"><small>Buildability</small><strong>${property.buildability}</strong></div>
      <div class="compact-fact"><small>Zoning</small><strong>${property.zoning}</strong></div>
      <div class="compact-fact"><small>Waterfront</small><strong>${property.waterfront}</strong></div>
      <div class="compact-fact"><small>Flood zone</small><strong>${property.floodZone}</strong></div>
      <div class="compact-fact"><small>Utilities</small><strong>${property.utilities}</strong></div>
      <div class="compact-fact"><small>Destination</small><strong>${property.destinationScore}/100</strong></div>
      <div class="compact-fact"><small>Operations</small><strong>${property.operationsScore}/100</strong></div>
      <div class="compact-fact"><small>Expansion</small><strong>${property.expansionScore}/100</strong></div>
      <div class="compact-fact"><small>Location accuracy</small><strong>${property.locationAccuracy}</strong></div>
    </div>`;
}

function accordionItem(id, title, subtitle, status, content) {
  const open = openAccordionSection === id;
  return `
    <section class="accordion-item ${open ? "open" : ""}" data-section="${id}">
      <button class="accordion-trigger" type="button" aria-expanded="${open}" data-section="${id}">
        <span class="accordion-indicator ${status}"></span>
        <span class="accordion-title"><strong>${title}</strong><small>${subtitle}</small></span>
        <span class="accordion-chevron">›</span>
      </button>
      <div class="accordion-content"><div class="accordion-content-inner"><div class="accordion-body">${content}</div></div></div>
    </section>`;
}

function renderIntelligencePanel(property) {
  const panel = document.getElementById("intelligence-panel");
  panel.innerHTML = `
    <div class="intelligence-shell">
      ${accordionItem("overview", "Overview", `${property.verdict} · ${property.score}/100 opportunity`, statusClass(property, "overview"), overviewContent(property))}
      ${accordionItem("county", "County Intelligence", counties[property.county] ? `${property.county} official-source profile` : "Profile pending", statusClass(property, "county"), countyContent(property))}
      ${accordionItem("details", "Property Details", "Zoning, utilities, flood and expansion", statusClass(property, "details"), detailsContent(property))}
    </div>`;
  panel.querySelectorAll(".accordion-trigger").forEach(trigger => {
    trigger.addEventListener("click", () => {
      openAccordionSection = trigger.dataset.section;
      renderIntelligencePanel(property);
    });
  });
}

function renderRealitySection(property) {
  const section = document.getElementById("reality-check-panel");
  section.innerHTML = realityContent(property);
}

function renderProperty(property) {
  activePropertyId = property.id;
  openAccordionSection = "overview";
  renderQueue();
  renderIntelligencePanel(property);
  renderRealitySection(property);
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
    const icon = L.divIcon({ className: "custom-pin", html: `<div class="pin"><span>${property.score}</span></div>`, iconSize: [48, 48], iconAnchor: [24, 46] });
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
    document.getElementById("intelligence-panel").innerHTML = `<div class="verdict"><strong>Dashboard error:</strong> ${error.message}</div>`;
  }
}

window.joeVisionMap = L.map("map", { zoomControl: false, scrollWheelZoom: true }).setView([29.05, -82.52], 8);
L.control.zoom({ position: "bottomright" }).addTo(window.joeVisionMap);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(window.joeVisionMap);
initializeDashboard();