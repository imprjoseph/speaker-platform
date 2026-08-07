/**
 * 通用試算表存取層：把 Sheet 分頁當成「有主鍵的資料表」操作。
 * 所有 *Service.js 都透過這一層讀寫，不直接碰 SpreadsheetApp。
 */

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('找不到分頁：' + name + '，請先執行 setupSpreadsheet()。');
  return sh;
}

function headers_(name) {
  return SCHEMA[name];
}

/** 讀出整張表，回傳 [{欄位:值, ...}, ...]，並附上內部 _row（試算表實際列號，供更新用）。 */
function getAllRows_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var headers = headers_(name);
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var obj = rowToObject_(headers, values[i]);
    if (isRowEmpty_(obj)) continue;
    obj._row = i + 2;
    rows.push(obj);
  }
  return rows;
}

function rowToObject_(headers, arr) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) obj[headers[i]] = arr[i];
  return obj;
}

function isRowEmpty_(obj) {
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] !== '' && obj[keys[i]] !== null && obj[keys[i]] !== undefined) return false;
  }
  return true;
}

/** 依單一欄位值找出所有符合的列。 */
function findRowsBy_(name, field, value) {
  return getAllRows_(name).filter(function (r) { return r[field] === value; });
}

function findOneBy_(name, field, value) {
  var rows = findRowsBy_(name, field, value);
  return rows.length ? rows[0] : null;
}

/** 新增一列。obj 只需提供要填的欄位，其餘留空；回傳寫入後的完整物件（含 _row）。 */
function insertRow_(name, obj) {
  var sh = sheet_(name);
  var headers = headers_(name);
  var arr = headers.map(function (h) { return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''; });
  sh.appendRow(arr);
  var row = sh.getLastRow();
  var result = rowToObject_(headers, arr);
  result._row = row;
  return result;
}

/** 依主鍵欄位更新既有列的部分欄位（patch 語意，不覆蓋未提供的欄位）。 */
function updateRowByKey_(name, keyField, keyValue, patch) {
  var sh = sheet_(name);
  var headers = headers_(name);
  var existing = findOneBy_(name, keyField, keyValue);
  if (!existing) throw new Error(name + ' 找不到 ' + keyField + '=' + keyValue);

  Object.keys(patch).forEach(function (field) {
    var col = headers.indexOf(field);
    if (col === -1) throw new Error(name + ' 沒有欄位：' + field);
    sh.getRange(existing._row, col + 1).setValue(patch[field]);
  });
  return findOneBy_(name, keyField, keyValue);
}

function nowIso_() {
  return new Date();
}

function newId_(prefix) {
  return (prefix ? prefix + '_' : '') + Utilities.getUuid().slice(0, 8);
}
