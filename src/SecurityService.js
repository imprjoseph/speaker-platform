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

/**
 * 一般情況下用 Session.getActiveUser() 判斷是誰在操作。
 * 但透過 fetch() 呼叫的 API（見 Code.js 的 handleApiCall_）不會帶 Google 的登入 Cookie，
 * Session.getActiveUser() 在那個路徑下永遠是空的，所以改成由前端在頁面載入時，
 * 把「當時用 Session 驗證過」的 Email 記下來，之後每次呼叫都夾帶回來，由這裡覆蓋。
 * 這是已知的信任折衷（見 README「已知限制」），僅適用小型內部團隊試用階段。
 */
var CALLER_EMAIL_OVERRIDE_ = null;

function setCallerEmailOverride_(email) {
  CALLER_EMAIL_OVERRIDE_ = email || null;
}

function currentUserEmail_() {
  if (CALLER_EMAIL_OVERRIDE_) return CALLER_EMAIL_OVERRIDE_;
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

/** 帳號管理（Module 15／二、系統使用者與權限）——僅系統管理員可操作。 */

function listUsers() {
  requireRole_([ROLES.SYSTEM_ADMIN]);
  return getAllRows_(SHEETS.USERS);
}

function addUser(name, email, role, actorEmail) {
  requireRole_([ROLES.SYSTEM_ADMIN]);
  if (getUserByEmail_(email)) throw new Error('此 Email 已經是系統使用者：' + email);
  if (Object.keys(ROLES).map(function (k) { return ROLES[k]; }).indexOf(role) === -1) {
    throw new Error('未知的角色：' + role);
  }
  var user = insertRow_(SHEETS.USERS, {
    UserId: newId_('USR'), Name: name, Email: email, Role: role, NotifyByEmail: true, CreatedAt: nowIso_()
  });
  writeAudit_(actorEmail, 'ADD_USER', SHEETS.USERS, user.UserId, email + ' / ' + role);
  return user;
}

function updateUserRole(userId, role, actorEmail) {
  requireRole_([ROLES.SYSTEM_ADMIN]);
  var updated = updateRowByKey_(SHEETS.USERS, 'UserId', userId, { Role: role });
  writeAudit_(actorEmail, 'UPDATE_USER_ROLE', SHEETS.USERS, userId, role);
  return updated;
}

function removeUser(userId, actorEmail) {
  requireRole_([ROLES.SYSTEM_ADMIN]);
  var target = findOneBy_(SHEETS.USERS, 'UserId', userId);
  if (target && target.Email === currentUserEmail_()) {
    throw new Error('不能移除自己的帳號，請由另一位系統管理員操作。');
  }
  deleteRowByKey_(SHEETS.USERS, 'UserId', userId);
  writeAudit_(actorEmail, 'REMOVE_USER', SHEETS.USERS, userId, '');
}

function listAuditLog(entityId, limit) {
  var rows = getAllRows_(SHEETS.AUDIT_LOG);
  if (entityId) rows = rows.filter(function (r) { return r.EntityId === entityId; });
  rows.sort(function (a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  return limit ? rows.slice(0, limit) : rows;
}
