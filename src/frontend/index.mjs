import Image from './Image.mjs';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.background = '#AADDFF';
  return canvas;
}

function drawMap(target, items, lonL, latT, lonR, latB) {
  const ww = target.width;
  const hh = target.height;
  const scX = ww / (lonR - lonL);
  const scY = hh / (latB - latT);
  for (const item of items) {
    const x = Math.floor((item.lon - lonL) * scX);
    const y = Math.floor((item.lat - latT) * scY);
    if (x >= 0 && x < ww && y >= 0 && y < hh) {
      target.inc(x, y, 0, 1.0);
    }
  }
}

function renderData(canvas, data) {
  const ww = data.width;
  const hh = data.height;
  const ctx = canvas.getContext('2d');
  const ctxImg = ctx.createImageData(ww, hh);
  for (let y = 0; y < hh; y += 1) {
    for (let x = 0; x < ww; x += 1) {
      const p = (y * ww + x) << 2;
      const v = data.get(x, y, 0);
      ctxImg.data[p  ] = v / 2.0 * 255.0;
      ctxImg.data[p|1] = v / 12.0 * 255.0;
      ctxImg.data[p|2] = 255;
      ctxImg.data[p|3] = v * 6.0 * 255.0;
    }
  }
  ctx.putImageData(ctxImg, 0, 0);
}

function* batched(data, batchSize) {
  for (let i = 0; i < data.length; i += batchSize) {
    yield data.slice(i, i + batchSize);
  }
}

function perFrame(generator, fn) {
  function next() {
    const v = generator.next();
    if (!v.done) {
      fn(v.value);
      setTimeout(next, 0);
    }
  }
  next();
}

async function init() {
  const locationsApi = await fetch('/api/locations');
  const locationsJson = await locationsApi.json();
  const allItems = locationsJson.items;

  const canvas = makeCanvas(600, 750);
  document.body.appendChild(canvas);

  const raw = new Image(canvas.width, canvas.height, 1);

  perFrame(batched(allItems, 10000), (itemsBatch) => {
    drawMap(raw, itemsBatch, -10, 60, 5, 48);

    const data = new Image(raw);
    data.blur(0.4);
    renderData(canvas, data);
  });
}

init();
