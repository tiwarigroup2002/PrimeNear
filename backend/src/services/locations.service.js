const ApiError = require('../utils/ApiError');
const { District, Tahsil } = require('../models');
const directory = require('./india-locations.service');

/** Finds or creates the district (by name + state). */
async function upsertDistrict(state, district) {
  return District.findOneAndUpdate({ name: district, state }, { $setOnInsert: { name: district, state, isActive: true } }, { upsert: true, returnDocument: 'after' });
}

/** Finds or creates a taluka and adds its PIN codes. */
async function upsertTahsil(districtDoc, name, pincodes = []) {
  return Tahsil.findOneAndUpdate(
    { districtId: districtDoc._id, name },
    { $setOnInsert: { districtId: districtDoc._id, name, isActive: true }, $addToSet: { pincodes: { $each: pincodes } } },
    { upsert: true, returnDocument: 'after' }
  );
}

/**
 * Adds talukas of one district from the India directory.
 * talukas: 'all' or a list of taluka names. Returns { district, tahsils }.
 */
async function importTalukas({ state, district, talukas = 'all' }) {
  const list = await directory.talukas(state, district);
  const c = await directory.canonical(state, district);
  const wanted = talukas === 'all' || !talukas?.length ? list : talukas.map((name) => {
    const found = list.find((t) => t.name.toLowerCase() === String(name).trim().toLowerCase());
    if (!found) throw ApiError.badRequest(`Taluka "${name}" is not in ${c.district}, ${c.state}`);
    return found;
  });
  const districtDoc = await upsertDistrict(c.state, c.district);
  const tahsils = [];
  for (const t of wanted) tahsils.push(await upsertTahsil(districtDoc, t.name, t.pincodes));
  return { district: districtDoc, tahsils };
}

/**
 * Taluka for a PIN code: from the saved talukas first, otherwise from the India
 * directory (the taluka is added on the fly). Returns { tahsil, district, state, taluka, districtName }.
 */
async function tahsilForPincode(pin) {
  const saved = await Tahsil.findOne({ pincodes: pin }).populate('districtId', 'name state');
  if (saved) return { tahsil: saved, state: saved.districtId?.state, districtName: saved.districtId?.name, taluka: saved.name };
  const [match] = await directory.lookupPincode(pin);
  const districtDoc = await upsertDistrict(match.state, match.district);
  const tahsil = await upsertTahsil(districtDoc, match.taluka, [pin]);
  return { tahsil, state: match.state, districtName: match.district, taluka: match.taluka };
}

/**
 * Seller selling area from rows [{ state, district, talukas: 'all' | [names] }].
 * Returns { serviceTahsilIds, districtIds }.
 */
async function resolveServiceArea(rows = []) {
  const tahsilIds = new Set();
  const districtIds = new Set();
  for (const row of rows) {
    const { district, tahsils } = await importTalukas(row);
    districtIds.add(String(district._id));
    tahsils.forEach((t) => tahsilIds.add(String(t._id)));
  }
  return { serviceTahsilIds: [...tahsilIds], districtIds: [...districtIds] };
}

/** Selling area grouped by district, for forms and detail pages. */
async function describeServiceArea(seller) {
  const ids = seller.serviceTahsilIds?.length ? seller.serviceTahsilIds : [seller.tahsilId];
  const tahsils = await Tahsil.find({ _id: { $in: ids } }).populate('districtId', 'name state').sort({ name: 1 });
  const groups = new Map();
  for (const t of tahsils) {
    const key = String(t.districtId?._id);
    if (!groups.has(key)) groups.set(key, { state: t.districtId?.state, district: t.districtId?.name, districtId: t.districtId?._id, talukas: [], pincodeCount: 0 });
    const g = groups.get(key);
    g.talukas.push(t.name);
    g.pincodeCount += t.pincodes.length;
  }
  const rows = [...groups.values()];
  // Mark rows that cover every taluka of the district in the directory
  for (const r of rows) {
    try {
      const all = await directory.talukas(r.state, r.district);
      r.allTalukas = all.length > 0 && all.every((t) => r.talukas.some((n) => n.toLowerCase() === t.name.toLowerCase()));
      r.totalTalukas = all.length;
    } catch {
      r.allTalukas = false;
    }
  }
  return rows;
}

/** All PIN codes a seller delivers to. */
async function servicePincodes(seller) {
  const ids = seller.serviceTahsilIds?.length ? seller.serviceTahsilIds : [seller.tahsilId];
  const tahsils = await Tahsil.find({ _id: { $in: ids }, isActive: true }).select('pincodes');
  const pins = new Set(tahsils.flatMap((t) => t.pincodes));
  if (seller.pincode) pins.add(seller.pincode);
  return pins;
}

module.exports = { importTalukas, tahsilForPincode, resolveServiceArea, describeServiceArea, servicePincodes, upsertDistrict, upsertTahsil };
