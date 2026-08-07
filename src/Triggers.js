/** 時間驅動觸發器安裝 —— 執行一次即可，之後每天自動掃描提醒。 */
function installDailyReminderTrigger() {
  removeTriggerByHandler_('runDailyReminderSweep');
  ScriptApp.newTrigger('runDailyReminderSweep')
    .timeBased()
    .everyDays(1)
    .atHour(8) // 台北時間早上 8 點掃描，產生待審信件供窗口上班後確認
    .create();
  Logger.log('已安裝每日提醒排程（每天 08:00 執行 runDailyReminderSweep）。');
}

function removeTriggerByHandler_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handlerName) ScriptApp.deleteTrigger(t);
  });
}
