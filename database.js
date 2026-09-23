/*
 * Al Suraishi ERP - storage adapter
 * The UI talks to this module instead of using IndexedDB directly.  The
 * adapter deliberately keeps the data model independent from the UI so it
 * can later be replaced by a REST/Supabase adapter without changing screens.
 */
const DB_NAME = 'AlSuraishiERP';
const DB_VERSION = 2;

export const STORES = [
  'products', 'categories', 'units', 'departments', 'customers', 'suppliers', 'sales', 'saleItems',
  'purchases', 'purchaseItems', 'salesReturns', 'salesReturnItems', 'purchaseReturns', 'purchaseReturnItems',
  'stockMovements', 'inventory', 'warehouses', 'warehouseZones', 'vehicles',
  'drivers', 'salesRepresentatives', 'routes', 'routeLoads', 'routeSales',
  'routeReturns', 'pallets', 'crates', 'qajwat', 'expenses', 'payments',
  'accounts', 'users', 'inventoryCounts', 'inventoryAdjustments', 'auditLogs', 'stocktakes', 'settings'
];

const storeIndexes = {
  products: [['code', 'sku'], ['name', 'name'], ['category', 'category'], ['barcode', 'barcode']],
  categories: [['name', 'name']],
  units: [['name', 'name'], ['status', 'status']],
  departments: [['name', 'name'], ['status', 'status']],
  customers: [['code', 'code'], ['name', 'name'], ['phone', 'phone']],
  suppliers: [['code', 'code'], ['name', 'name'], ['phone', 'phone']],
  sales: [['invoiceNumber', 'number'], ['date', 'date'], ['customerId', 'customerId'], ['status', 'status'], ['vehicleId', 'vehicleId'], ['routeId', 'routeId'], ['salespersonId', 'salespersonId']],
  saleItems: [['saleId', 'saleId'], ['productId', 'productId'], ['date', 'date']],
  purchases: [['invoiceNumber', 'number'], ['date', 'date'], ['supplierId', 'supplierId'], ['status', 'status']],
  purchaseItems: [['purchaseId', 'purchaseId'], ['productId', 'productId'], ['date', 'date']],
  salesReturns: [['date', 'date'], ['customerId', 'customerId'], ['productId', 'productId'], ['saleId', 'saleId']],
  salesReturnItems: [['returnId', 'returnId'], ['productId', 'productId']],
  purchaseReturns: [['date', 'date'], ['supplierId', 'supplierId'], ['productId', 'productId'], ['purchaseId', 'purchaseId']],
  purchaseReturnItems: [['returnId', 'returnId'], ['productId', 'productId']],
  stockMovements: [['date', 'date'], ['productId', 'productId'], ['warehouseId', 'warehouseId'], ['zoneId', 'zoneId'], ['type', 'type'], ['referenceId', 'referenceId'], ['vehicleId', 'vehicleId']],
  inventory: [['productId', 'productId'], ['warehouseId', 'warehouseId'], ['zoneId', 'zoneId']],
  warehouses: [['code', 'code'], ['name', 'name']],
  warehouseZones: [['warehouseId', 'warehouseId'], ['code', 'code'], ['status', 'status']],
  vehicles: [['code', 'code'], ['status', 'status']],
  drivers: [['name', 'name']],
  salesRepresentatives: [['name', 'name']],
  routes: [['number', 'code'], ['date', 'date'], ['vehicleId', 'vehicleId'], ['status', 'status']],
  routeLoads: [['routeId', 'routeId'], ['productId', 'productId']],
  routeSales: [['routeId', 'routeId'], ['productId', 'productId'], ['saleId', 'saleId']],
  routeReturns: [['routeId', 'routeId'], ['productId', 'productId']],
  pallets: [['status', 'status'], ['customerId', 'customerId'], ['vehicleId', 'vehicleId'], ['routeId', 'routeId']],
  crates: [['status', 'status'], ['customerId', 'customerId'], ['vehicleId', 'vehicleId'], ['routeId', 'routeId']],
  qajwat: [['status', 'status'], ['customerId', 'customerId'], ['vehicleId', 'vehicleId'], ['routeId', 'routeId']],
  expenses: [['date', 'date'], ['type', 'type']],
  payments: [['date', 'date'], ['partyType', 'partyType'], ['partyId', 'partyId']],
  accounts: [['partyType', 'partyType'], ['partyId', 'partyId']],
  users: [['name', 'name'], ['status', 'status']],
  inventoryCounts: [['date', 'date'], ['status', 'status']],
  inventoryAdjustments: [['date', 'date'], ['productId', 'productId'], ['countId', 'countId']],
  auditLogs: [['date', 'date'], ['action', 'action'], ['recordType', 'recordType'], ['recordId', 'recordId']],
  stocktakes: [['date', 'date'], ['status', 'status']],
  settings: [['key', 'key']]
};

const newId = () => globalThis.crypto?.randomUUID?.() || `ID-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
const idFor = (record, fallback = 'id') => record?.id || record?.[fallback] || newId();
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      STORES.forEach(name => {
        const store = database.objectStoreNames.contains(name)
          ? req.transaction.objectStore(name)
          : database.createObjectStore(name, { keyPath: 'id' });
        for (const [indexName, field] of (storeIndexes[name] || [])) {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, field, { unique: false });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('تعذر فتح قاعدة البيانات'));
    req.onblocked = () => reject(new Error('قاعدة البيانات قيد الاستخدام في نافذة أخرى'));
  });
}

const db = {
  _connection: null,
  _writeQueue: Promise.resolve(),

  async open() {
    if (!this._connection) this._connection = await openDatabase();
    return this._connection;
  },

  async transaction(stores, mode = 'readonly', callback = () => {}) {
    const database = await this.open();
    const names = Array.isArray(stores) ? stores : [stores];
    return new Promise((resolve, reject) => {
      let result;
      const tx = database.transaction(names, mode);
      const api = {
        get: (store, id) => tx.objectStore(store).get(id),
        getAll: (store, query, count) => tx.objectStore(store).getAll(query, count),
        put: (store, value) => tx.objectStore(store).put(value),
        add: (store, value) => tx.objectStore(store).add(value),
        delete: (store, id) => tx.objectStore(store).delete(id),
        clear: store => tx.objectStore(store).clear(),
        index: (store, name) => tx.objectStore(store).index(name)
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('فشلت عملية قاعدة البيانات، لم يتم تغيير البيانات'));
      tx.onabort = () => reject(tx.error || new Error('تم التراجع عن العملية، لم يتم تغيير البيانات'));
      try { result = callback(api, tx); } catch (error) { tx.abort(); reject(error); }
    });
  },

  async add(store, data) {
    const value = { ...clone(data), id: idFor(data) };
    await this.transaction(store, 'readwrite', api => api.add(store, value));
    return value;
  },
  async get(store, id) {
    const database = await this.open();
    return clone(await request(database.transaction(store).objectStore(store).get(id)));
  },
  async getAll(store, { limit, offset = 0 } = {}) {
    const database = await this.open();
    const values = await request(database.transaction(store).objectStore(store).getAll());
    return clone(limit == null ? values : values.slice(offset, offset + limit));
  },
  async page(store, { index = '', value, page = 1, pageSize = 20, direction = 'next' } = {}) {
    const database = await this.open();
    const objectStore = database.transaction(store).objectStore(store);
    const source = index ? objectStore.index(index) : objectStore;
    const range = value === undefined ? undefined : IDBKeyRange.only(value);
    return new Promise((resolve, reject) => {
      const rows = [], skip = Math.max(0, (page - 1) * pageSize);
      let seen = 0;
      const requestCursor = source.openCursor(range, direction);
      requestCursor.onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) return resolve({ rows: clone(rows), page, pageSize, hasNextPage: false });
        if (seen++ >= skip && rows.length < pageSize) rows.push(cursor.value);
        if (rows.length >= pageSize) {
          const next = cursor.continue();
          void next;
          requestCursor.onsuccess = nextEvent => resolve({ rows: clone(rows), page, pageSize, hasNextPage: Boolean(nextEvent.target.result) });
          return;
        }
        cursor.continue();
      };
      requestCursor.onerror = () => reject(requestCursor.error || new Error('تعذر تحميل صفحة البيانات'));
    });
  },
  async update(store, data) {
    if (!data?.id) throw new Error('لا يمكن تحديث سجل بدون ID');
    const value = clone(data);
    await this.transaction(store, 'readwrite', api => api.put(store, value));
    return value;
  },
  async delete(store, id) {
    await this.transaction(store, 'readwrite', api => api.delete(store, id));
  },
  async clear(store) {
    await this.transaction(store, 'readwrite', api => api.clear(store));
  },
  async where(store, index, value, { limit } = {}) {
    const database = await this.open();
    const objectStore = database.transaction(store).objectStore(store);
    const source = index ? objectStore.index(index) : objectStore;
    return clone(await request(source.getAll(IDBKeyRange.only(value), limit)));
  },
  async count(store) {
    const database = await this.open();
    return request(database.transaction(store).objectStore(store).count());
  },

  async _replaceStore(tx, store, rows) {
    tx.clear(store);
    for (const row of rows || []) tx.put(store, { ...clone(row), id: idFor(row) });
  },

  async replaceAll(snapshot, { includeSettings = true } = {}) {
    const stores = includeSettings ? STORES : STORES.filter(name => name !== 'settings');
    const rows = toStores(snapshot);
    this._writeQueue = this._writeQueue.then(() => this.transaction(stores, 'readwrite', tx => {
      for (const store of stores) this._replaceStore(tx, store, rows[store]);
    }));
    return this._writeQueue;
  },

  async saveSnapshot(snapshot) {
    return this.replaceAll(snapshot, { includeSettings: true });
  },

  async readState() {
    const database = await this.open();
    const result = {};
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORES, 'readonly');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('تعذر قراءة بيانات النظام'));
      for (const store of STORES) tx.objectStore(store).getAll().onsuccess = event => { result[store] = event.target.result; };
    });
    return fromStores(result);
  },

  async exportBackup() {
    const database = await this.open();
    const stores = {};
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORES, 'readonly');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('تعذر تصدير النسخة الاحتياطية'));
      for (const name of STORES) tx.objectStore(name).getAll().onsuccess = event => { stores[name] = event.target.result; };
    });
    return { format: 'AlSuraishiERP', version: 1, exportedAt: new Date().toISOString(), stores };
  },

  async importBackup(backup, mode = 'replace') {
    if (!backup || backup.format !== 'AlSuraishiERP' || !backup.stores || typeof backup.stores !== 'object') {
      throw new Error('ملف النسخة الاحتياطية غير صالح أو ليس لبرنامج السريحي ERP');
    }
    const incoming = {};
    for (const store of STORES) incoming[store] = Array.isArray(backup.stores[store]) ? backup.stores[store] : [];
    if (mode === 'merge') {
      const current = await this.exportBackup();
      for (const store of STORES) incoming[store] = [...(current.stores[store] || []), ...incoming[store]];
      const seen = new Set();
      for (const store of STORES) incoming[store] = incoming[store].filter(row => { const id = idFor(row); if (seen.has(`${store}:${id}`)) return false; seen.add(`${store}:${id}`); return true; });
    }
    await this.replaceAll(fromStores(incoming), { includeSettings: true });
    await this.add('settings', { id: 'migration.localStorage.v1', key: 'migration.localStorage.v1', status: 'success', completedAt: new Date().toISOString(), source: 'backup' });
    return this.readState();
  },

  async migrateLegacy(legacyKey, seedFactory) {
    await this.open();
    const marker = await this.get('settings', 'migration.localStorage.v1');
    const existing = await this.count('products') + await this.count('sales') + await this.count('customers');
    if (existing > 0) return { migrated: false, seeded: false };

    const raw = localStorage.getItem(legacyKey);
    let source = null;
    if (raw) {
      try {
        localStorage.setItem(`${legacyKey}:backup:${Date.now()}`, raw);
        source = JSON.parse(raw);
      } catch (error) {
        console.error('Legacy LocalStorage backup/migration failed', error);
        throw new Error('تعذر قراءة بيانات LocalStorage القديمة. لم يتم حذف أي بيانات.');
      }
    }
    const snapshot = source ? normalizeLegacy(source) : seedFactory();
    try {
      await this.saveSnapshot(snapshot);
      await this.add('settings', { id: 'migration.localStorage.v1', key: 'migration.localStorage.v1', status: 'success', completedAt: new Date().toISOString(), source: source ? 'localStorage' : 'seed' });
      await this.add('auditLogs', { id: newId(), date: new Date().toISOString(), user: 'النظام', action: source ? 'Migration' : 'تهيئة النظام', recordType: 'system', recordId: DB_NAME, details: source ? 'تم ترحيل LocalStorage إلى IndexedDB مع الاحتفاظ بنسخة احتياطية' : 'تم إنشاء بيانات البداية في IndexedDB' });
      return { migrated: Boolean(source), seeded: !source };
    } catch (error) {
      console.error('IndexedDB migration failed', error);
      throw new Error('تعذر حفظ الترحيل في IndexedDB. بقيت بيانات LocalStorage كما هي.');
    }
  },

  async deleteOperationalData() {
    const keep = new Set(['settings']);
    const targets = STORES.filter(store => !keep.has(store));
    await this.transaction(targets, 'readwrite', tx => targets.forEach(store => tx.clear(store)));
  },
  async resetSystem() {
    await this.transaction(STORES, 'readwrite', tx => STORES.forEach(store => tx.clear(store)));
  }
};

function normalizeLegacy(source) {
  const snapshot = { ...source, meta: { company: 'شركة السريحي', currency: 'د.ت', ...(source.meta || {}) } };
  const rows = toStores(snapshot);
  return fromStores(rows);
}

function toStores(snapshot = {}) {
  const products = (snapshot.products || []).map(p => ({ ...p, id: idFor(p), code: p.code || p.sku }));
  const productById = new Map(products.map(p => [p.id, p]));
  const categories = (snapshot.categories || [...new Set(products.map(p => p.category).filter(Boolean))]).map(name => typeof name === 'string' ? { id: `CAT-${name}`, name, status: 'نشط' } : name);
  const units = (snapshot.units || ['حبة', 'كرتون', 'كرتونة', 'صندوق', 'طبليّة', 'طبلة', 'لتر']).map(name => typeof name === 'string' ? { id: `UNIT-${name}`, name, status: 'نشط' } : name);
  const departments = (snapshot.departments || ['المخزن الرئيسي', 'المبيعات', 'التوزيع', 'الإدارة']).map(name => typeof name === 'string' ? { id: `DEPT-${name}`, name, status: 'نشط' } : name);
  const warehouses = snapshot.warehouses?.length ? snapshot.warehouses : [{ id: 'wh-main', code: 'MAIN', name: 'المستودع الرئيسي', status: 'نشط' }];
  const zones = snapshot.warehouseZones?.length ? snapshot.warehouseZones : ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(code => ({ id: `ZONE-${code}`, warehouseId: 'wh-main', code, name: `منطقة ${code}`, status: 'نشط', storageType: 'عام' }));
  const sales = (snapshot.sales || []).map(s => ({ ...s, id: idFor(s), invoiceNumber: s.invoiceNumber || s.number, status: s.status || 'مسودة' }));
  const purchases = (snapshot.purchases || []).map(p => ({ ...p, id: idFor(p), invoiceNumber: p.invoiceNumber || p.number, status: p.status || 'مسودة' }));
  const saleItems = (snapshot.saleItems || []).concat(sales.flatMap(s => (s.lines || []).map((line, index) => ({ ...line, id: line.id || `${s.id}-${index}`, saleId: s.id, date: s.date }))));
  const purchaseItems = (snapshot.purchaseItems || []).concat(purchases.flatMap(p => (p.lines || []).map((line, index) => ({ ...line, id: line.id || `${p.id}-${index}`, purchaseId: p.id, date: p.date }))));
  const movements = (snapshot.stockMovements || snapshot.movements || []).map(m => ({ ...m, id: idFor(m), movementId: m.movementId || m.id, quantity: Number(m.quantity ?? m.qty ?? 0), qty: Number(m.qty ?? m.quantity ?? 0), referenceId: m.referenceId || m.ref }));
  const returns = snapshot.returns || [];
  const salesReturns = [...(snapshot.salesReturns || []), ...returns.filter(r => r.partyType !== 'supplier')].map(r => ({ ...r, id: idFor(r), productId: r.productId || products.find(p => p.name === r.product)?.id, customerId: r.customerId || snapshot.customers?.find(c => c.name === r.party)?.id }));
  const purchaseReturns = [...(snapshot.purchaseReturns || []), ...returns.filter(r => r.partyType === 'supplier')].map(r => ({ ...r, id: idFor(r), productId: r.productId || products.find(p => p.name === r.product)?.id, supplierId: r.supplierId || snapshot.suppliers?.find(s => s.name === r.party)?.id }));
  const salesReturnItems = snapshot.salesReturnItems || salesReturns.flatMap(row => row.items || [{ id: `${row.id}-${row.productId}`, returnId: row.id, productId: row.productId, quantity: row.qty, amount: row.amount }]);
  const purchaseReturnItems = snapshot.purchaseReturnItems || purchaseReturns.flatMap(row => row.items || [{ id: `${row.id}-${row.productId}`, returnId: row.id, productId: row.productId, quantity: row.qty, amount: row.amount }]);
  const inventory = products.map(p => ({ id: `INV-${p.id}`, productId: p.id, warehouseId: p.warehouseId || 'wh-main', zoneId: p.zoneId || `ZONE-${p.zone || 'A'}`, quantity: Number(p.stock || 0), damaged: Number(p.damaged || 0), updatedAt: new Date().toISOString() }));
  const retainedSettings = (snapshot.stores?.settings || []).filter(setting => setting.id !== 'meta');
  const settings = [{ id: 'meta', key: 'meta', value: snapshot.meta || { company: 'شركة السريحي', currency: 'د.ت' } }, ...retainedSettings];
  const assets = snapshot.assets || [];
  const byType = type => assets.filter(a => String(a.type || '').includes(type)).map(a => ({ ...a, id: idFor(a), type: a.type, status: 'متاح' }));
  const vehicles = snapshot.vehicles || [];
  const drivers = snapshot.drivers?.length ? snapshot.drivers : [...new Set(vehicles.map(v => v.driver).filter(Boolean))].map(name => ({ id: `DRV-${name}`, name, status: 'نشط' }));
  const salesRepresentatives = snapshot.salesRepresentatives?.length ? snapshot.salesRepresentatives : [...new Set(vehicles.map(v => v.seller).filter(Boolean))].map(name => ({ id: `REP-${name}`, name, status: 'نشط' }));
  return {
    products, categories, units, departments, customers: snapshot.customers || [], suppliers: snapshot.suppliers || [], sales, saleItems,
    purchases, purchaseItems, salesReturns, salesReturnItems, purchaseReturns, purchaseReturnItems, stockMovements: movements, inventory, warehouses, warehouseZones: zones,
    vehicles, drivers, salesRepresentatives, routes: snapshot.routes || [],
    routeLoads: snapshot.routeLoads || snapshot.routes?.flatMap(r => (r.loaded || []).map(x => ({ id: `${r.id}-${x.productId}`, routeId: r.id, productId: x.productId, quantity: x.qty }))) || [],
    routeSales: snapshot.routeSales || snapshot.routes?.flatMap(r => (r.sold || []).map(x => ({ id: `${r.id}-${x.productId}-${x.saleId || newId()}`, routeId: r.id, productId: x.productId, saleId: x.saleId, quantity: x.qty }))) || [],
    routeReturns: snapshot.routeReturns || snapshot.routes?.flatMap(r => (r.returned || []).map(x => ({ id: `${r.id}-${x.productId}`, routeId: r.id, productId: x.productId, quantity: x.qty }))) || [],
    pallets: snapshot.pallets || byType('طبالي'), crates: snapshot.crates || byType('صندوق'), qajwat: snapshot.qajwat || byType('قجوة'),
    expenses: snapshot.expenses || [], payments: snapshot.payments || [], accounts: snapshot.accounts || [], users: snapshot.users || [], inventoryCounts: snapshot.inventoryCounts || snapshot.stocktakes || [], inventoryAdjustments: snapshot.inventoryAdjustments || [], auditLogs: snapshot.auditLogs || snapshot.activity || [], stocktakes: snapshot.stocktakes || [],
    settings
  };
}

function fromStores(stores = {}) {
  const sales = (stores.sales || []).map(s => ({ ...s, number: s.number || s.invoiceNumber, lines: (stores.saleItems || []).filter(line => line.saleId === s.id) }));
  const purchases = (stores.purchases || []).map(p => ({ ...p, number: p.number || p.invoiceNumber, lines: (stores.purchaseItems || []).filter(line => line.purchaseId === p.id) }));
  const meta = stores.settings?.find(s => s.id === 'meta')?.value || { company: 'شركة السريحي', currency: 'د.ت', theme: 'light' };
  return {
    meta, products: stores.products || [], categories: stores.categories || [], units: stores.units || [], departments: stores.departments || [], customers: stores.customers || [], suppliers: stores.suppliers || [],
    sales, purchases, payments: stores.payments || [], expenses: stores.expenses || [], returns: [...(stores.salesReturns || []).map(row => ({...row, returnType: 'sales'})), ...(stores.purchaseReturns || []).map(row => ({...row, returnType: 'purchases'}))],
    movements: stores.stockMovements || [], vehicles: stores.vehicles || [], drivers: stores.drivers || [], salesRepresentatives: stores.salesRepresentatives || [], routes: stores.routes || [], assets: [...(stores.pallets || []), ...(stores.crates || []), ...(stores.qajwat || [])],
    stocktakes: stores.stocktakes || stores.inventoryCounts || [], inventoryCounts: stores.inventoryCounts || [], inventoryAdjustments: stores.inventoryAdjustments || [], users: stores.users || [], activity: stores.auditLogs || [], warehouses: stores.warehouses || [], warehouseZones: stores.warehouseZones || [],
    salesReturnItems: stores.salesReturnItems || [], purchaseReturnItems: stores.purchaseReturnItems || [], stores
  };
}

export { db };
