const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/respond');
const { escapeRegex } = require('../../utils/pagination');
const { District, Tahsil, Seller, User } = require('../../models');
const { audit } = require('../../services/audit.service');

const ciExact = (name) => new RegExp(`^${escapeRegex(name.trim())}$`, 'i');

async function countBy(model, field, ids, extra = {}) {
  const rows = await model.aggregate([{ $match: { [field]: { $in: ids }, status: { $ne: 'Deleted' }, ...extra } }, { $unwind: `$${field}` }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
}

async function listDistricts(req, res) {
  const filter = {};
  if (req.query.status === 'active') filter.isActive = true;
  const districts = await District.find(filter).sort({ name: 1 });
  const ids = districts.map((d) => d._id);
  const [tahsils, sellers] = await Promise.all([
    Tahsil.aggregate([{ $match: { districtId: { $in: ids } } }, { $group: { _id: '$districtId', count: { $sum: 1 }, tahsilIds: { $push: '$_id' } } }]),
    countBy(Seller, 'districtIds', ids),
  ]);
  const tMap = Object.fromEntries(tahsils.map((t) => [String(t._id), t]));
  const allTahsilIds = tahsils.flatMap((t) => t.tahsilIds);
  const userByTahsil = await countBy(User, 'tahsilId', allTahsilIds);
  return ok(res, districts.map((d) => {
    const t = tMap[String(d._id)];
    return {
      ...d.toJSON(),
      tahsilCount: t?.count || 0,
      sellerCount: sellers[String(d._id)] || 0,
      userCount: (t?.tahsilIds || []).reduce((s, id) => s + (userByTahsil[String(id)] || 0), 0),
    };
  }));
}

async function createDistrict(req, res) {
  if (await District.exists({ name: ciExact(req.body.name) })) throw ApiError.conflict('District already exists');
  const { tahsils = [], ...body } = req.body;
  const district = await District.create(body);
  const createdTahsils = tahsils.length ? await Tahsil.insertMany(tahsils.map((t) => ({ ...t, districtId: district._id }))) : [];
  await audit(req, { action: 'Created', entityType: 'District', entityId: district._id, newValue: { ...district.toJSON(), tahsils: createdTahsils.length } });
  return created(res, { district, tahsils: createdTahsils }, 'District created');
}

async function updateDistrict(req, res) {
  const district = await District.findById(req.params.districtId);
  if (!district) throw ApiError.notFound('District not found');
  if (req.body.name && (await District.exists({ name: ciExact(req.body.name), _id: { $ne: district._id } }))) throw ApiError.conflict('District already exists');
  const before = district.toJSON();
  Object.assign(district, req.body);
  await district.save();
  await audit(req, { action: 'Updated', entityType: 'District', entityId: district._id, oldValue: before, newValue: district });
  return ok(res, district, 'District updated');
}

async function deleteDistrict(req, res) {
  const district = await District.findById(req.params.districtId);
  if (!district) throw ApiError.notFound('District not found');
  const tahsilIds = await Tahsil.distinct('_id', { districtId: district._id });
  const sellers = await Seller.countDocuments({ status: { $ne: 'Deleted' }, $or: [{ districtIds: district._id }, { tahsilId: { $in: tahsilIds } }] });
  if (sellers) throw ApiError.badRequest(`${sellers} seller(s) are assigned to this district. Deactivate it instead.`);
  await Tahsil.deleteMany({ districtId: district._id });
  await district.deleteOne();
  await audit(req, { action: 'Deleted', entityType: 'District', entityId: district._id, oldValue: district });
  return ok(res, null, 'District deleted');
}

async function listTahsils(req, res) {
  const filter = {};
  if (req.query.district) filter.districtId = req.query.district;
  if (req.query.status === 'active') filter.isActive = true;
  const tahsils = await Tahsil.find(filter).sort({ name: 1 }).populate('districtId', 'name');
  const ids = tahsils.map((t) => t._id);
  const [sellers, users] = await Promise.all([countBy(Seller, 'tahsilId', ids), countBy(User, 'tahsilId', ids)]);
  return ok(res, tahsils.map((t) => ({ ...t.toJSON(), district: t.districtId?.name, sellerCount: sellers[String(t._id)] || 0, userCount: users[String(t._id)] || 0 })));
}

async function createTahsil(req, res) {
  if (!(await District.exists({ _id: req.body.districtId }))) throw ApiError.badRequest('District not found');
  if (await Tahsil.exists({ districtId: req.body.districtId, name: ciExact(req.body.name) })) throw ApiError.conflict('Tahsil already exists in this district');
  const tahsil = await Tahsil.create(req.body);
  await audit(req, { action: 'Created', entityType: 'Tahsil', entityId: tahsil._id, newValue: tahsil });
  return created(res, tahsil, 'Tahsil created');
}

async function updateTahsil(req, res) {
  const tahsil = await Tahsil.findById(req.params.tahsilId);
  if (!tahsil) throw ApiError.notFound('Tahsil not found');
  const districtId = req.body.districtId || tahsil.districtId;
  if (req.body.districtId && !(await District.exists({ _id: districtId }))) throw ApiError.badRequest('District not found');
  if (req.body.name && (await Tahsil.exists({ districtId, name: ciExact(req.body.name), _id: { $ne: tahsil._id } }))) throw ApiError.conflict('Tahsil already exists in this district');
  const before = tahsil.toJSON();
  Object.assign(tahsil, req.body);
  await tahsil.save();
  await audit(req, { action: 'Updated', entityType: 'Tahsil', entityId: tahsil._id, oldValue: before, newValue: tahsil });
  return ok(res, tahsil, 'Tahsil updated');
}

async function deleteTahsil(req, res) {
  const tahsil = await Tahsil.findById(req.params.tahsilId);
  if (!tahsil) throw ApiError.notFound('Tahsil not found');
  const sellers = await Seller.countDocuments({ tahsilId: tahsil._id, status: { $ne: 'Deleted' } });
  if (sellers) throw ApiError.badRequest(`${sellers} seller(s) belong to this tahsil. Deactivate it instead.`);
  await tahsil.deleteOne();
  await User.updateMany({ tahsilId: tahsil._id }, { $unset: { tahsilId: 1 } });
  await audit(req, { action: 'Deleted', entityType: 'Tahsil', entityId: tahsil._id, oldValue: tahsil });
  return ok(res, null, 'Tahsil deleted');
}

module.exports = { listDistricts, createDistrict, updateDistrict, deleteDistrict, listTahsils, createTahsil, updateTahsil, deleteTahsil };
