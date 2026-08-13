const formatPrice = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const properties = window.PROPERTIES || [];
const unique = (key) => [...new Set(properties.map((item) => item[key]))].sort();
const filters = { price: "any", district: "any", year: "any", type: "any", beds: "any" };
let map;
let markers = [];

const matches = (property) => {
  const priceOk =
    filters.price === "any" ||
    (filters.price === "under-800" && property.price < 800000) ||
    (filters.price === "800-1500" && property.price >= 800000 && property.price <= 1500000) ||
    (filters.price === "over-1500" && property.price > 1500000);
  const yearOk =
    filters.year === "any" ||
    (filters.year === "pre-1950" && property.year < 1950) ||
    (filters.year === "1950-1999" && property.year >= 1950 && property.year <= 1999) ||
    (filters.year === "2000-plus" && property.year >= 2000);
  const bedsOk = filters.beds === "any" || property.beds >= Number(filters.beds);
  const districtOk = filters.district === "any" || property.district === filters.district;
  const typeOk = filters.type === "any" || property.type === filters.type;
  return priceOk && yearOk && bedsOk && districtOk && typeOk;
};

const renderResults = (list) => {
  const root = document.getElementById("map-results");
  if (!root) return;
  root.innerHTML = list.length
    ? list
        .map(
          (item) => `
        <article class="result" data-id="${item.id}" style="display:grid;grid-template-columns:110px 1fr;gap:.85rem;padding:.9rem;border-bottom:1px solid rgba(22,20,16,.12);cursor:pointer">
          <img src="${item.image}" alt="${item.title}" style="width:110px;height:80px;object-fit:cover">
          <div>
            <h4 style="margin:0;font-family:Cormorant Garamond,Georgia,serif;font-size:1.15rem">${formatPrice(item.price)}</h4>
            <p class="ed-meta">${item.address}, ${item.city}</p>
            <p class="ed-meta">${item.beds} bd · ${item.baths} ba · ${item.year}</p>
          </div>
        </article>`
        )
        .join("")
    : `<p style="padding:1rem">No sample listings match these filters.</p>`;

  root.querySelectorAll("[data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const property = properties.find((item) => item.id === node.dataset.id);
      if (map && property) map.flyTo({ center: [property.lng, property.lat], zoom: 13 });
    });
  });
};

const drawMarkers = (list) => {
  markers.forEach((marker) => marker.remove());
  markers = [];
  if (!map || !window.mapboxgl) return;
  list.forEach((item) => {
    const popup = new mapboxgl.Popup({ offset: 18 }).setHTML(
      `<strong>${formatPrice(item.price)}</strong><br>${item.address}, ${item.city}`
    );
    markers.push(
      new mapboxgl.Marker({ color: "#b08d57" })
        .setLngLat([item.lng, item.lat])
        .setPopup(popup)
        .addTo(map)
    );
  });
};

const applyFilters = () => {
  const list = properties.filter(matches);
  renderResults(list);
  drawMarkers(list);
  const count = document.getElementById("result-count");
  if (count) count.textContent = `${list.length} sample listings`;
};

const district = document.getElementById("filter-district");
const type = document.getElementById("filter-type");
unique("district").forEach((value) => {
  district?.insertAdjacentHTML("beforeend", `<option value="${value}">${value}</option>`);
});
unique("type").forEach((value) => {
  type?.insertAdjacentHTML("beforeend", `<option value="${value}">${value}</option>`);
});
document.querySelectorAll("[data-filter]").forEach((control) => {
  control.addEventListener("change", () => {
    filters[control.dataset.filter] = control.value;
    applyFilters();
  });
});
document.getElementById("reset-filters")?.addEventListener("click", () => {
  Object.keys(filters).forEach((key) => {
    filters[key] = "any";
  });
  document.querySelectorAll("[data-filter]").forEach((control) => {
    control.value = "any";
  });
  applyFilters();
});

const token = window.SITE_CONFIG?.mapboxToken;
const canvas = document.getElementById("map");
if (token && window.mapboxgl && canvas) {
  mapboxgl.accessToken = token;
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    center: [window.SITE_CONFIG.mapLng, window.SITE_CONFIG.mapLat],
    zoom: window.SITE_CONFIG.mapZoom,
  });
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
} else if (canvas) {
  canvas.innerHTML =
    '<div style="display:grid;place-items:center;height:100%;padding:2rem;text-align:center">Mapbox token missing on this install.</div>';
}
applyFilters();
