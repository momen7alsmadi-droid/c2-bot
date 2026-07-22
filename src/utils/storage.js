const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const LEAVES_PATH = path.join(DATA_DIR, 'leaves.json');
const REPORTS_PATH = path.join(DATA_DIR, 'reports.json');

const DEFAULT_CONFIG = {
  leave: {
    allowedRoleId: null,     // من يمكنه استخدام /اجازة
    requestChannelId: null,  // الروم الذي ترسل له طلبات الاجازة
    rolesToRemove: [],       // الرتب التي تُزال عند قبول الاجازة (فقط إذا كانت موجودة لدى العضو)
    leaveRoleId: null,       // رتبة الاجازة التي تُعطى بعد القبول
    logChannelId: null       // روم لوق نظام الاجازات
  },
  daleel: {
    allowedRoleId: null,     // من يمكنه استخدام /دليل
    channelId: null,         // الروم الذي تُرسل له استمارات الدلائل
    logChannelId: null       // روم لوق نظام الدلائل
  },
  report: {
    allowedRoleId: null,            // من يمكنه استخدام /بلاغ (فارغ = الجميع)
    adminRoleId: null,              // الرتبة الإدارية التي يجب أن يملكها من يُبلَّغ عنه
    channelId: null,                // الروم الذي تُرسل له استمارات البلاغات
    warning1RoleId: null,           // رتبة التحذير الأول
    warning2RoleId: null,           // رتبة التحذير الثاني
    warning3RoleId: null,           // رتبة الفصل من الإدارة (التحذير الثالث)
    upperManagementRoleId: null,    // رتبة الإدارة العليا التي تُشعَر عند الفصل
    upperManagementChannelId: null, // روم إشعارات الإدارة العليا
    logChannelId: null,             // روم لوق نظام البلاغات
    cooldownEnabled: true,          // الكولداون شغال ولا لا
    cooldownDuration: 60            // مدة الكولداون بالدقائق
  },
  resign: {
    allowedRoleId: null,      // من يمكنه استخدام /استقالة
    logChannelId: null,       // روم لوق الاستقالات
    rolesToRemove: [],        // الرتب التي تُزال عند تقديم الاستقالة
    resignRoleId: null,       // رتبة ما بعد الاستقالة
    upperManagementRoleId: null  // رتبة الإدارة العليا (للأزرار)
  },
  disabledGuilds: []          // السيرفرات المعطلة
}

function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error(`فشل في قراءة الملف ${filePath}:`, e);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getConfig() {
  const cfg = readJSON(CONFIG_PATH, DEFAULT_CONFIG);
  // دمج مع القيم الافتراضية حتى لا تنكسر الإعدادات القديمة عند أي تحديث
  return {
    leave: { ...DEFAULT_CONFIG.leave, ...(cfg.leave || {}) },
    daleel: { ...DEFAULT_CONFIG.daleel, ...(cfg.daleel || {}) },
    report: { ...DEFAULT_CONFIG.report, ...(cfg.report || {}) },
    resign: { ...DEFAULT_CONFIG.resign, ...(cfg.resign || {}) },
    disabledGuilds: Array.isArray(cfg.disabledGuilds) ? cfg.disabledGuilds : []
  };
}

function saveConfig(cfg) {
  writeJSON(CONFIG_PATH, cfg);
}

function getLeaves() {
  return readJSON(LEAVES_PATH, {});
}

function saveLeaves(leaves) {
  writeJSON(LEAVES_PATH, leaves);
}

function getReports() {
  return readJSON(REPORTS_PATH, {});
}

function saveReports(reports) {
  writeJSON(REPORTS_PATH, reports);
}

module.exports = {
  getConfig, saveConfig,
  getLeaves, saveLeaves,
  getReports, saveReports
};
