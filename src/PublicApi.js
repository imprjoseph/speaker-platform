/** 講者填寫頁（免登入，token 驗證）呼叫的公開 API —— 不得洩漏非本人資料。 */

function getSpeakerFormData(token) {
  var resolved = resolveInviteToken(token);
  if (!resolved.valid) throw new Error(resolved.reason);
  var link = resolved.link;
  logFormOpened(link.ActivitySpeakerId);

  var activity = getActivity(link.ActivityId);
  var speaker = getSpeaker(link.SpeakerId);
  var reqs = getApplicableRequirements_(link.ActivitySpeakerId);
  var responses = getResponses(link.ActivitySpeakerId);

  var fields = reqs.map(function (req) {
    var resp = responses.filter(function (r) { return r.FieldKey === req.FieldKey; })[0];
    return {
      fieldKey: req.FieldKey, labelZh: req.LabelZh, labelEn: req.LabelEn, fieldType: req.FieldType,
      options: req.Options ? req.Options.split(',') : [],
      required: req.Required, deadline: formatDate_(resolveFieldDeadline(link.ActivitySpeakerId, req.FieldKey)),
      value: resp ? resp.Value : '', status: computeItemStatus(link.ActivitySpeakerId, req.FieldKey)
    };
  });

  return {
    activityName: activity.NameZh, activityDate: formatDate_(activity.StartDate), venue: activity.Venue,
    speakerName: speaker.NameZh, inviteStatus: link.InviteStatus, fields: fields
  };
}

function submitInvitationResponse(token, decision) {
  return respondToInvitation(token, decision);
}

function submitField(token, fieldKey, value, isSubmit) {
  var resolved = resolveInviteToken(token);
  if (!resolved.valid) throw new Error(resolved.reason);
  return saveResponse(resolved.link.ActivitySpeakerId, fieldKey, value, !!isSubmit, '(講者本人)');
}

/** fileBlob: { fileName, mimeType, base64Data, fileType, fieldKey } */
function submitFileUpload(token, fileBlob) {
  var resolved = resolveInviteToken(token);
  if (!resolved.valid) throw new Error(resolved.reason);
  return uploadFile(resolved.link.ActivitySpeakerId, fileBlob, '(講者本人)');
}
