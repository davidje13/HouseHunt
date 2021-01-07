export function make(tag, attrs = {}, children = []) {
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

export function money(v) {
  return v.toLocaleString(undefined, { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function makeCanvas(w, h, dpr) {
  const canvas = make('canvas', {
    width: Math.round(w * dpr),
    height: Math.round(h * dpr),
  });
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  return canvas;
}
