const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const config = require('../config');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * India state -> district -> taluka -> PIN code directory.
 *
 * Source: the free "All India Pincode Directory" (Open Government Data, India Post),
 * downloaded once and cached as a compact JSON in storage/. PIN codes that are not in
 * the directory are looked up live in the free India Post API (api.postalpincode.in).
 */

const BAD = new Set(['', 'NA', 'N.A.', 'NULL', '-']);
const SMALL_WORDS = new Set(['and', 'of', 'the']);

/** "MADHYA PRADESH" -> "Madhya Pradesh", "ANDAMAN & NICOBAR ISLANDS" -> "Andaman & Nicobar Islands" */
function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/(^|[-(/.])([a-z])/g, (_m, p, c) => p + c.toUpperCase())))
    .join(' ');
}

const clean = (v) => {
  const s = String(v || '').trim().replace(/\s+/g, ' ');
  return BAD.has(s.toUpperCase()) ? '' : s;
};

/** Builds { states: { state: { district: { taluka: [pins] } } } } from the CSV text. */
function buildIndex(csvText) {
  const rows = parse(csvText.replace(/^﻿/, ''), { columns: (h) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true });
  const states = {};
  for (const r of rows) {
    const pin = String(r.pincode || '').trim();
    if (!/^\d{6}$/.test(pin)) continue;
    const state = titleCase(clean(r.statename));
    const district = titleCase(clean(r.districtname));
    if (!state || !district) continue;
    const taluka = titleCase(clean(r.taluk)) || district;
    const d = ((states[state] ||= {})[district] ||= {});
    const pins = (d[taluka] ||= []);
    if (!pins.includes(pin)) pins.push(pin);
  }
  for (const s of Object.values(states)) for (const d of Object.values(s)) for (const t of Object.keys(d)) d[t].sort();
  return { builtAt: new Date().toISOString(), states };
}

let index = null;
let pinIndex = null;
let loading = null;

function indexPins(data) {
  const map = new Map();
  for (const [state, districts] of Object.entries(data.states)) {
    for (const [district, talukas] of Object.entries(districts)) {
      for (const [taluka, pins] of Object.entries(talukas)) {
        for (const pin of pins) {
          if (!map.has(pin)) map.set(pin, []);
          map.get(pin).push({ state, district, taluka });
        }
      }
    }
  }
  return map;
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Loads the directory (cache -> local file -> download). Concurrent callers share one load. */
async function load() {
  if (index) return index;
  if (!loading) {
    loading = (async () => {
      const { cacheFile, sourceFile, sourceUrl } = config.indiaLocations;
      let data = null;
      if (!sourceFile && fs.existsSync(cacheFile)) {
        data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } else {
        const csv = sourceFile ? fs.readFileSync(sourceFile, 'utf8') : await download(sourceUrl);
        data = buildIndex(csv);
        if (!sourceFile) {
          fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify(data));
          logger.info(`India location directory saved: ${Object.keys(data.states).length} states`);
        }
      }
      index = data;
      pinIndex = indexPins(data);
      return data;
    })().catch((err) => {
      loading = null;
      logger.error(`India location directory could not be loaded: ${err.message}`);
      throw new ApiError(503, 'The India location list could not be loaded. Check the internet connection and try again.');
    });
  }
  return loading;
}

const byName = (a, b) => a.localeCompare(b);

function findKey(obj, name) {
  if (!obj || !name) return null;
  const want = String(name).trim().toLowerCase();
  return Object.keys(obj).find((k) => k.toLowerCase() === want) || null;
}

async function states() {
  const data = await load();
  return Object.keys(data.states).sort(byName);
}

async function districts(state) {
  const data = await load();
  const s = findKey(data.states, state);
  if (!s) throw ApiError.notFound(`State "${state}" not found`);
  return Object.keys(data.states[s]).sort(byName);
}

/** Talukas of a district with their PIN codes. */
async function talukas(state, district) {
  const data = await load();
  const s = findKey(data.states, state);
  const d = s && findKey(data.states[s], district);
  if (!d) throw ApiError.notFound(`District "${district}" not found in ${state}`);
  return Object.entries(data.states[s][d])
    .map(([name, pincodes]) => ({ name, pincodes }))
    .sort((a, b) => byName(a.name, b.name));
}

/** Exact names as stored in the directory (fixes case / spacing typed by people). */
async function canonical(state, district, taluka) {
  const data = await load();
  const s = findKey(data.states, state);
  const d = s && findKey(data.states[s], district);
  const t = d && taluka ? findKey(data.states[s][d], taluka) : null;
  return { state: s, district: d, taluka: t, pincodes: t ? data.states[s][d][t] : [] };
}

async function lookupIndiaPost(pin) {
  try {
    const res = await fetch(config.indiaLocations.pincodeApi + pin, { signal: AbortSignal.timeout(10000) });
    const body = await res.json();
    const offices = body?.[0]?.Status === 'Success' ? body[0].PostOffice || [] : [];
    const seen = new Set();
    return offices
      .map((o) => ({ state: titleCase(o.State), district: titleCase(o.District), taluka: titleCase(clean(o.Block)) || titleCase(o.District) }))
      .filter((m) => m.state && m.district && !seen.has(`${m.state}|${m.district}|${m.taluka}`) && seen.add(`${m.state}|${m.district}|${m.taluka}`));
  } catch (err) {
    logger.warn(`India Post PIN lookup failed for ${pin}: ${err.message}`);
    return null;
  }
}

/**
 * Where is this PIN code? Returns [{ state, district, taluka }] (usually one match).
 * Throws 404 for an unknown PIN.
 */
async function lookupPincode(pin) {
  if (!/^\d{6}$/.test(String(pin))) throw ApiError.badRequest('PIN code must be 6 digits');
  let matches = null;
  try {
    await load();
    matches = pinIndex.get(String(pin)) || null;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }
  if (!matches?.length) matches = await lookupIndiaPost(pin);
  if (matches === null) throw new ApiError(503, 'Could not check the PIN code right now. Please try again.');
  if (!matches.length) throw ApiError.notFound(`PIN code ${pin} was not found`);
  return matches;
}

/** For tests: forget the loaded directory. */
function reset() {
  index = null;
  pinIndex = null;
  loading = null;
}

module.exports = { states, districts, talukas, canonical, lookupPincode, buildIndex, titleCase, load, reset };
