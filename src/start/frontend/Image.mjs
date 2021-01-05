export default class Image {
  constructor(w, h, c) {
    if (w instanceof Image) {
      this.w = w.w;
      this.h = w.h;
      this.c = w.c;
      this.d = new Float32Array(w.d);
    } else {
      this.w = Math.round(w);
      this.h = Math.round(h);
      this.c = c;
      this.d = new Float32Array(this.w * this.h * this.c);
    }
  }

  get width() {
    return this.w;
  }

  get height() {
    return this.h;
  }

  set(x, y, c, v) {
    this.d[((y * this.w) + x) * this.c + c] = v;
  }

  get(x, y, c) {
    return this.d[((y * this.w) + x) * this.c + c];
  }

  inc(x, y, c, v) {
    this.d[((y * this.w) + x) * this.c + c] += v;
  }

  blur(r, limit = 0.01) {
    const { w, h, c } = this;
    const n = 1 / Math.sqrt(2 * Math.PI * r * r);
    const m = -1 / (2 * r * r);
    const dist = Math.round(Math.sqrt(Math.log(limit) / m));
    if (dist <= 0) {
      return;
    }
    const mults = [];
    let sum = 0;
    for (let d = 0; d <= dist; d += 1) {
      mults[d] = Math.exp(m * d * d);
      sum += mults[d];
    }
    const norm = 1 / (sum * 2 - mults[0]);
    for (let d = 0; d <= dist; d += 1) {
      mults[d] *= norm;
    }

    let d1 = this.d;
    let d2 = new Float32Array(w * h * c);
    for (const dd of [c, w * c]) {
      for (let y = dist; y < h - dist; y += 1) {
        for (let x = dist; x < w - dist; x += 1) {
          for (let z = 0; z < c; z += 1) {
            const i = (y * w + x) * c + z;
            let t = 0;
            for (let d = -dist; d <= dist; d += 1) {
              t += d1[i + d * dd] * mults[Math.abs(d)];
            }
            d2[i] = t;
          }
        }
      }
      [d1, d2] = [d2, d1];
    }
    // TODO: border
  }
}
