export default class Throttle {
  constructor(limit, period) {
    if (limit < 1) {
      throw new Error('cannot have throttle limit < 1');
    }
    this.limit = limit;
    this.period = period;
    this.calls = [];
  }

  async check() {
    if (this.period <= 0) {
      return;
    }
    while (this.calls.length >= this.limit) {
      const delay = this.calls[0] + this.period - Date.now();
      if (delay > 0) {
        if (delay > 10000) {
          console.info(`${new Date().toISOString()}: Throttling until ${new Date(Date.now() + delay).toISOString()} (${(delay / 1000).toFixed()}s)`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const cutoff = Date.now() - this.period;
      while (this.calls.length > 0 && this.calls[0] <= cutoff) {
        this.calls.shift();
      }
      if (this.calls.length >= this.limit) {
        console.warn(`Throttle woke spuriously at ${new Date().toISOString()}, oldest action from ${new Date(this.calls[0]).toISOString()}`);
      }
    }
    this.calls.push(Date.now());
  }

  async limitReached() {
    // fill calls with current time
    const now = Date.now();
    while (this.calls.length < this.limit) {
      this.calls.push(now);
    }
    // enforce minimum delay since we just hit the limit
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return this.check();
  }
}
