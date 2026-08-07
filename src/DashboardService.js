/** Module 11｜儀表板與統計 */

function getActivityDashboard(activityId) {
  var board = getActivityTaskBoard(activityId);
  var total = board.length;

  var completed = board.filter(function (s) { return s.inviteStatus === STATUS.INVITE.COMPLETED; }).length;
  var overdue = board.filter(function (s) { return s.items.some(function (i) { return i.status === ITEM_STATUS.OVERDUE; }); });
  var notOpened = board.filter(function (s) { return s.items.every(function (i) { return i.status === ITEM_STATUS.NOT_SENT || i.status === ITEM_STATUS.SENT; }); });
  var atRisk = board.filter(function (s) { return s.items.filter(function (i) { return i.status === ITEM_STATUS.OVERDUE; }).length >= 2; });

  return {
    activityId: activityId,
    totalSpeakers: total,
    completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0,
    overdueSpeakers: overdue.map(pickBoardSummary_),
    notOpenedSpeakers: notOpened.map(pickBoardSummary_),
    atRiskSpeakers: atRisk.map(pickBoardSummary_),
    byOwner: groupMissingByOwner_(activityId, board)
  };
}

function pickBoardSummary_(s) {
  return { activitySpeakerId: s.activitySpeakerId, speakerName: s.speakerName, missingCount: s.missingCount };
}

function groupMissingByOwner_(activityId, board) {
  var links = findRowsBy_(SHEETS.ACTIVITY_SPEAKERS, 'ActivityId', activityId);
  var ownerMap = {};
  links.forEach(function (link) {
    var entry = board.filter(function (b) { return b.activitySpeakerId === link.ActivitySpeakerId; })[0];
    if (!entry) return;
    var ownerId = link.OwnerUserId || '(未指派)';
    ownerMap[ownerId] = (ownerMap[ownerId] || 0) + entry.missingCount;
  });
  return Object.keys(ownerMap).map(function (ownerId) {
    var user = ownerId !== '(未指派)' ? findOneBy_(SHEETS.USERS, 'UserId', ownerId) : null;
    return { owner: user ? user.Name : '(未指派)', pendingItems: ownerMap[ownerId] };
  });
}

/** 主管首頁：跨活動的本週到期／逾期彙總。 */
function getExecutiveSummary() {
  var activities = listActivities({ status: 'Active' });
  return activities.map(function (a) {
    var d = getActivityDashboard(a.ActivityId);
    return {
      activityId: a.ActivityId, activityName: a.NameZh, startDate: formatDate_(a.StartDate),
      completionRate: d.completionRate, overdueCount: d.overdueSpeakers.length, atRiskCount: d.atRiskSpeakers.length
    };
  });
}
