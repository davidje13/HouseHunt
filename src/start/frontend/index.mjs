const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

function make(tag, attrs = {}, children = []) {
  const o = document.createElement(tag);
  for (const c of children) {
    if (typeof c === 'string') {
      o.appendChild(document.createTextNode(c));
    } else if (c) {
      o.appendChild(c);
    }
  }
  Object.entries(attrs).forEach(([k, v]) => {
    o.setAttribute(k, v);
  });
  return o;
}

function money(v) {
  return v.toLocaleString(undefined, { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function makeCanvas(w, h) {
  const canvas = make('canvas', {
    width: Math.round(w * dpr),
    height: Math.round(h * dpr),
  });
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  return canvas;
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

async function init() {
  const side = document.getElementById('side');
  side.appendChild(make('h2', {}, ['Prices']));
  const priceHistogram = makeCanvas(300, 30); side.appendChild(priceHistogram);

  const filters = document.getElementById('filters');
  const total = document.getElementById('total');
  filters.addEventListener('submit', (e) => {
    e.preventDefault();
    refreshFilters();
  });
  const initial = new Map(new URLSearchParams(document.location.hash.substr(1)));
  for (const input of filters.querySelectorAll('input,select')) {
    input.addEventListener('input', () => {
      refreshFilters();
    });
    const initialValue = initial.get(input.getAttribute('name'));
    if (initialValue !== undefined) {
      if (input.getAttribute('type') === 'checkbox') {
        input.checked = (initialValue === 'true');
      } else {
        input.value = initialValue;
      }
    }
  }

  const locationsApi = await fetch('/api/locations');
  const locationsJson = await locationsApi.json();
  const allItems = locationsJson.items;
  let filteredItems = null;

  const mapItems = new ol.source.Vector();
  function replaceMapItems(items) {
    mapItems.clear();
    mapItems.addFeatures(items.map((item) => new ol.Feature({
      id: item.id,
      geometry: new ol.geom.Point(ol.proj.fromLonLat([item.lon, item.lat])),
    })));
  }

  let debouncedMapUpdate = null;
  function updateFilter(filter, minPrice, maxPrice, normaliseSharedPrice) {
    filteredItems = allItems.filter(filter);
    total.innerText = filteredItems.length.toLocaleString();
    renderPriceHistogram(priceHistogram, filteredItems, { bucketCount: 50, minPrice, maxPrice, normaliseSharedPrice });

    clearTimeout(debouncedMapUpdate);
    debouncedMapUpdate = setTimeout(() => replaceMapItems(filteredItems), 300);
  }

  function refreshFilters() {
    const savedValues = new URLSearchParams();
    for (const input of filters.querySelectorAll('input,select')) {
      let value = input.value;
      if (input.getAttribute('type') === 'checkbox') {
        value = input.checked ? 'true' : 'false';
      }
      savedValues.append(input.getAttribute('name'), value);
    }
    document.location.hash = savedValues.toString();

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
      return types.some((t) => type.startsWith(t));
    }, minPrice, maxPrice, shared === 'full');
  }
  refreshFilters();

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
}

init();
