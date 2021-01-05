import fetch, { FetchError } from 'node-fetch';
import Throttle from '../../util/Throttle.mjs';

const API_BASE = 'https://api.zoopla.co.uk/api/v1';
const API_KEY = process.env.ZOOPLA_KEY;

const apiThrottle = new Throttle(100, 1000 * 60 * 60); // max permitted API call rate: 100/hour
const RETRY_MIN_DELAY = 5000;

function getText(res) {
  return res.text().catch(() => '<failed to get response text>');
}

export async function callAPI(api, params) {
  const url = `${API_BASE}/${api}.json?${new URLSearchParams({ api_key: API_KEY, ...params })}`;
  const maskedUrl = `${API_BASE}/${api}.json?${new URLSearchParams({ api_key: 'hidden', ...params })}`;

  while (true) {
    await apiThrottle.check();
    console.info(`calling ${maskedUrl}`);
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      console.warn(`Failed to load ${maskedUrl}; error: ${e.message}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MIN_DELAY));
      continue;
    }
    console.log('API call completed');
    if (res.ok) {
      let json;
      console.log('extracting JSON');
      try {
        json = await res.json();
        console.log('.json() call completed');
      } catch (e) {
        if (e instanceof FetchError) {
          console.warn(`Failed to load ${maskedUrl}; error: ${e.message}`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_MIN_DELAY));
          continue;
        }
        console.log('failed to parse JSON', e);
        const text = await getText(res);
        console.log('got', text);
        throw new Error(`JSON parse error from ${maskedUrl}; error: ${e.message}; raw: ${text}`);
      }
      if (json.error_code) {
        throw new Error(`API error from ${maskedUrl}: ${json.error_code} - ${json.error_string}`);
      }
      return json;
    }
    console.log('extracting error text');
    const text = await getText(res);
    console.log('got error text', text);
    if (res.status === 403 && text.includes('Developer Over Rate')) {
      // We have reached the API rate limit
      console.warn(`${new Date().toISOString()}: API rate limit reached`);
      await apiThrottle.limitReached();
      continue;
    }
    if (res.status < 500) {
      throw new Error(`Status error from ${maskedUrl}; status: ${res.status}; raw: ${text}`);
    }
    console.warn(`Status error from ${maskedUrl}; status: ${res.status}; raw: ${text}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_MIN_DELAY));
  }
}

export async function checkConnectionError() {
  if (!API_KEY) {
    return 'No Zoopla API key given; see the Readme for details';
  }
  const res = await callAPI('geo_autocomplete', {}).catch((e) => e.message);
  if (typeof res !== 'string') {
    return 'Unexpected result from Zoopla API';
  }
  if (res.includes('status: 403')) {
    return 'Invalid Zoopla API key given';
  }
  return null;
}
