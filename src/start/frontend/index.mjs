import { make, money, makeCanvas } from './display.mjs';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const side = document.getElementById('side');
const filters = document.getElementById('filters');
const total = document.getElementById('total');

function coordsToHash(coords, dp) {
  return coords.map((l) => l.map(([x, y]) => `${x.toFixed(dp)}x${y.toFixed(dp)}`).join('o')).join('l');
}

function hashToCoords(hash) {
  return hash.split('l').map((l) => l.split('o').map((c) => c.split('x').map(Number)));
}

function saveState(areaSource) {
  const savedValues = new URLSearchParams();
  for (const input of filters.querySelectorAll('input,select')) {
    let value = input.value;
    if (input.getAttribute('type') === 'checkbox') {
      value = input.checked ? 'true' : 'false';
    }
    savedValues.append(input.getAttribute('name'), value);
  }
  const area = areaSource.getFeatures()[0]?.getGeometry();
  if (area) {
    savedValues.append('area', coordsToHash(area.getCoordinates(), 0));
  }
  window.location.hash = savedValues.toString();
}

function loadState(areaSource) {
  const initial = new Map(new URLSearchParams(window.location.hash.substr(1)));
  for (const input of filters.querySelectorAll('input,select')) {
    const initialValue = initial.get(input.getAttribute('name'));
    if (initialValue !== undefined) {
      if (input.getAttribute('type') === 'checkbox') {
        input.checked = (initialValue === 'true');
      } else {
        input.value = initialValue;
      }
    }
  }
  areaSource.clear();
  const area = initial.get('area');
  if (area) {
    areaSource.addFeature(new ol.Feature(new ol.geom.Polygon(hashToCoords(area))));
  }
}

function triState(v) {
  if (!v) {
    return null;
  }
  return v === 'true';
}

function renderPriceHistogram(canvas, items, { bucketCount, bucketMax, minPrice, maxPrice, normaliseSharedPrice } = {}) {
  const priceMapping = normaliseSharedPrice
    ? ((i) => (i.price / i.share))
    : ((i) => i.price);
  const prices = items.map(priceMapping).sort((a, b) => (a - b));
  if (!minPrice && (!maxPrice || !Number.isFinite(maxPrice))) {
    maxPrice = prices[prices.length - 1];
    const p95 = prices[Math.floor(prices.length * 0.95)];
    if (p95 < maxPrice * 0.7) {
      maxPrice = p95;
    }
    minPrice = prices[0];
    if (minPrice < maxPrice * 0.5) {
      minPrice = 0;
    }
  }
  if (!bucketCount) {
    bucketCount = canvas.width;
  }
  const histogram = new Uint32Array(bucketCount);
  const scale = (bucketCount - 1) / (maxPrice - minPrice);
  prices.forEach((price) => {
    const bucket = Math.floor((price - minPrice) * scale);
    if (bucket >= 0 && bucket < bucketCount) {
      histogram[bucket] += 1;
    }
  });

  if (!bucketMax) {
    bucketMax = Math.max(...histogram);
  }

  const ww = canvas.width;
  const hh = canvas.height;
  const xscale = ww / bucketCount;
  const yscale = hh / bucketMax;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ww, hh);
  ctx.fillStyle = '#FF0000';
  for (let i = 0; i < bucketCount; ++ i) {
    const v = histogram[i];
    if (v) {
      const x = Math.floor(i * xscale);
      const w = Math.floor((i + 1) * xscale) - x;
      const h = Math.ceil(v * yscale);
      ctx.fillRect(x, hh - h, w, h);
    }
  }

  return { bucketCount, bucketMax, minPrice, maxPrice };
}

function renderCard(details) {
  const img = details.image || details.thumbnail;
  const link = make('a', { href: details.url, target: '_blank', rel: 'noopener noreferrer' }, [make('div', { class: 'details' }, [
    make('h2', {}, [details.extracted?.address ?? details.id]),
    make('span', { class: 'price' }, [money(details.price / details.share)]),
    make('span', { class: 'info' }, [
      img ? make('img', { src: img, rel: 'noreferrer' }) : null,
      JSON.stringify(details, null, 1),
    ]),
  ])]);
  return link;
}

side.appendChild(make('h2', {}, ['Prices']));
const priceHistogram = makeCanvas(300, 30, dpr);
side.appendChild(priceHistogram);

const areaSource = new ol.source.Vector();
const mapItems = new ol.source.Vector();

for (const input of filters.querySelectorAll('input,select')) {
  input.addEventListener('input', () => {
    refreshFilters();
  });
}
filters.addEventListener('submit', (e) => {
  e.preventDefault();
  refreshFilters();
});

let allItems = [];
let filteredItems = [];

function replaceMapItems(items) {
  mapItems.clear();
  mapItems.addFeatures(items.map((item) => new ol.Feature({ id: item.id, geometry: new ol.geom.Point(item.olProj) })));
}

let debouncedMapUpdate = null;
function updateFilter(filter, minPrice, maxPrice, normaliseSharedPrice) {
  filteredItems = allItems.filter(filter);
  total.innerText = filteredItems.length.toLocaleString();
  renderPriceHistogram(priceHistogram, filteredItems, { bucketCount: 50, minPrice, maxPrice, normaliseSharedPrice });

  clearTimeout(debouncedMapUpdate);
  debouncedMapUpdate = setTimeout(() => replaceMapItems(filteredItems), 300);
}

function refreshFilters(save = true) {
  if (save) {
    saveState(areaSource);
  }

  const minPrice = Number(filters.querySelector('[name="price-min"]').value || '0');
  const maxPrice = Number(filters.querySelector('[name="price-max"]').value || 'Infinity');
  const minBeds = Number(filters.querySelector('[name="beds-min"]').value || '-1');
  const maxBeds = Number(filters.querySelector('[name="beds-max"]').value || 'Infinity');
  const retirement = triState(filters.querySelector('[name="retirement"]').value);
  const investment = triState(filters.querySelector('[name="investment"]').value);
  const ownership = filters.querySelector('[name="ownership"]').value;
  const shared = filters.querySelector('[name="shared"]').value;
  const newBuild = triState(filters.querySelector('[name="new"]').value);
  const types = [...filters.querySelectorAll('.type-pickers input')]
    .filter((i) => i.checked)
    .map((i) => i.getAttribute('name').substr(5));
  types.push('unknown');
  const bounds = areaSource.getFeatures()[0]?.getGeometry();
  updateFilter((i) => {
    let { type, price } = i;
    if (shared === 'full') {
      price /= i.share;
    } else if (shared === 'false' && i.share !== 1) {
      return false;
    }
    const match = (
      price >= minPrice && price <= maxPrice &&
      i.beds >= minBeds && i.beds <= maxBeds &&
      (retirement === null || i.retirement === retirement) &&
      (investment === null || i.investment === investment) &&
      (newBuild === null || i.newbuild === newBuild)
    );
    if (!match) {
      return false;
    }
    if (ownership && ownership !== i.ownership) {
      if (ownership === 'freehold_share' && i.ownership === 'freehold') {
        // also allowed (freehold > freehold_share)
      } else {
        return false;
      }
    }
    if (!types.some((t) => type.startsWith(t))) {
      return false;
    }
    if (bounds && !bounds.intersectsCoordinate(i.olProj)) {
      return false;
    }
    return true;
  }, minPrice, maxPrice, shared === 'full');
}

const farPointLayer = new ol.layer.WebGLPoints({
  source: mapItems,
  maxZoom: 11,
  style: {
    symbol: {
      symbolType: 'square',
      size: 0.5,
      color: '#FFFFFF',
    },
  },
  disableHitDetection: true,
});

const nearPointLayer = new ol.layer.WebGLPoints({
  source: mapItems,
  minZoom: 11,
  style: {
    symbol: {
      symbolType: 'circle',
      size: ['interpolate', ['exponential', 0.8], ['zoom'], 11, 5, 19, 30],
      color: '#FFFFFF',
    },
  },
});

const overlayBox = make('ul');
const overlay = new ol.Overlay({
  element: make('section', { class: 'popup' }, [overlayBox]),
  positioning: 'bottom-center',
  offset: [0, -15],
  autoPan: {
    animation: {
      duration: 250,
    },
    margin: 20,
  },
});

const map = new ol.Map({
  target: 'map',
  moveTolerance: 3,
  pixelRatio: dpr,
  layers: [
    new ol.layer.Tile({
      source: new ol.source.OSM({
        transition: 0,
      }),
      opacity: 0.3,
    }),
    new ol.layer.Vector({
      source: areaSource,
      style: new ol.style.Style({
        fill: new ol.style.Fill({
          color: 'rgba(255, 255, 255, 0.05)',
        }),
        stroke: new ol.style.Stroke({
          color: '#3377FF',
          width: 2,
        }),
      }),
    }),
    farPointLayer,
    nearPointLayer,
  ],
  overlays: [
    overlay,
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat([-3.44, 55.38]),
    zoom: 5.5,
    maxZoom: 19,
  }),
});

const modify = new ol.interaction.Modify({
  source: areaSource,
  style: new ol.style.Style({
    image: new ol.style.Circle({
      radius: 4,
      fill: new ol.style.Fill({
        color: '#3377FF',
      }),
      stroke: new ol.style.Stroke({
        color: '#FFFFFF',
        width: 1,
      }),
    }),
  }),
  deleteCondition: (e) => ol.events.condition.doubleClick(e) || (ol.events.condition.singleClick(e) && ol.events.condition.altKeyOnly(e)),
});
modify.on('modifyend', () => {
  setTimeout(() => {
    refreshFilters();
  }, 0);
});
const draw = new ol.interaction.Draw({
  source: areaSource,
  type: 'Polygon',
  style: [
    new ol.style.Style({
      fill: new ol.style.Fill({
        color: 'rgba(255, 255, 255, 0.05)',
      }),
      stroke: new ol.style.Stroke({
        color: 'rgba(255, 255, 255, 0.5)',
        width: 4,
      }),
    }),
    new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: '#3377FF',
        width: 2,
      }),
    }),
  ],
});

map.addInteraction(modify);
if (!areaSource.getFeatures().length) {
  map.addInteraction(draw);
  draw.on('drawend', () => {
    areaSource.clear(); // remove old lines if any
    // delay so that it can store the result and block the double-click-to-zoom event
    setTimeout(() => {
      map.removeInteraction(draw);
      refreshFilters();
    }, 0);
  });
}

map.on('click', (e) => {
  const features = map.getFeaturesAtPixel(e.pixel, { layerFilter: (l) => l === nearPointLayer });
  if (!features.length) {
    overlay.setPosition(undefined);
    return;
  }
  // webglpointlayer hit test is only capable of returning 1 match...
  const { id, geometry } = features[0].getProperties();
  const details0 = filteredItems.find((i) => i.id === id);
  if (!details0) {
    console.warn(`Failed to find property details for ${id}`);
    return;
  }
  // ...but we find nearby items to show as well
  const details = filteredItems.filter((i) => ((i.lat - details0.lat) ** 2 + (i.lon - details0.lon) ** 2 < 0.0001 ** 2));

  overlayBox.innerText = '';
  details.forEach((detail) => {
    const container = make('li');
    container.appendChild(renderCard(detail));
    if (!detail.full) {
      fetch(`/api/locations/${encodeURIComponent(id)}`)
        .then((d) => d.json())
        .then((d) => {
          Object.assign(detail, d);
          detail.full = true;
          container.innerText = '';
          container.appendChild(renderCard(detail));
          overlay.setPosition(geometry.getCoordinates());
        })
        .catch((e) => console.warn(`Failed to load full property details for ${id}`, e));
    }
    overlayBox.appendChild(container);
  });
  overlay.setPosition(geometry.getCoordinates());
});

loadState(areaSource);
let lastHash = window.location.hash;
window.addEventListener('hashchange', () => {
  const hash = window.location.hash;
  if (hash !== lastHash) {
    lastHash = hash;
    loadState(areaSource);
    refreshFilters(false);
  }
});

fetch('/api/locations')
  .then((d) => d.json())
  .then((d) => {
    allItems = d.items.map((item) => ({ ...item, olProj: ol.proj.fromLonLat([item.lon, item.lat]) }));
    refreshFilters(false);
  })
  .catch((e) => console.error('Failed to load items', e));
