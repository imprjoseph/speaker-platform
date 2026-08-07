/**
 * Module 15｜安全與稽核（MVP 範圍）
 * 傳輸與靜態加密由 Google Workspace 基礎設施提供；此處負責角色權限與操作留痕。
 * 尚未涵蓋：檔案病毒掃描（Apps Script 無原生 API，建議日後接第三方掃描服務或 Workspace DLP）。
 */

var ROLES = {
  SYSTEM_ADMIN: 'SystemAdmin',
  PROJECT_LEAD: 'ProjectLead',
  PROJECT_MEMBER: 'ProjectMember',
  ONSITE_STAFF: 'OnsiteStaff',
  CLIENT_READONLY: 'ClientReadOnly'
};

function writeAudit_(actorEmail, action, entityType, entityId, detail) {
  var sh = sheet_(SHEETS.AUDIT_LOG);
  sh.appendRow([newId_('LOG'), nowIso_(), actorEmail || '(unknown)', action, entityType, entityId, detail || '']);
}

function currentUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '(anonymous)';
  } catch (e) {
    return '(anonymous)';
  }
}

function getUserByEmail_(email) {
  return findOneBy_(SHEETS.USERS, 'Email', email);
}

/** 目前登入者的角色；找不到帳號視為無權限（僅講者專屬連結流程不受此限）。 */
function getCurrentUserRole_() {
  var user = getUserByEmail_(currentUserEmail_());
  return user ? user.Role : null;
}

function requireRole_(allowedRoles) {
  var role = getCurrentUserRole_();
  if (!role || allowedRoles.indexOf(role) === -1) {
    throw new Error('權限不足：此操作僅限 ' + allowedRoles.join('/') + ' 執行。');
  }
  return role;
}

/** 建立系統管理員帳號（僅供第一次建置時，由執行 Apps Script 編輯器的人手動跑一次）。 */
function bootstrapFirstAdmin(name) {
  var email = currentUserEmail_();
  if (getUserByEmail_(email)) {
    Logger.log('此帳號已存在，略過建立。');
    return;
  }
  insertRow_(SHEETS.USERS, {
    UserId: newId_('USR'), Name: name || email, Email: email,
    Role: ROLES.SYSTEM_ADMIN, NotifyByEmail: true, CreatedAt: nowIso_()
  });
  Logger.log('已建立系統管理員：' + email);
}

function listAuditLog(entityId, limit) {
  var rows = getAllRows_(SHEETS.AUDIT_LOG);
  if (entityId) rows = rows.filter(function (r) { return r.EntityId === entityId; });
  rows.sort(function (a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  return limit ? rows.slice(0, limit) : rows;
}
