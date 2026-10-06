// Manual runs must have a displayable outcome even when the API returns no debug rows.
export const makeRuleRunResult = (ruleName, result) => ({
  ...result,
  ruleName,
  success: result?.success === true,
  triggered: result?.triggered ?? null,
  duration: result?.duration ?? null,
  debug: Array.isArray(result?.debug) ? result.debug : [],
  message: result?.message || (!result?.success ? 'Rule không thể chạy' : ''),
});

export const makeRuleRunError = (ruleName, error) => {
  const timeout = ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code);
  return makeRuleRunResult(ruleName, {
    success: false,
    outcomeUnknown: true,
    message: timeout
      ? 'Yêu cầu chạy rule vượt thời gian chờ 60 giây. Chưa nhận được kết quả; rule có thể vẫn đang chạy trên máy chủ. Kiểm tra Lịch sử trước khi chạy lại.'
      : `${error?.message || 'Không nhận được kết quả chạy rule'}. Chưa xác nhận được kết quả thực thi; kiểm tra Lịch sử trước khi chạy lại.`,
  });
};

export const getRuleRunSummary = (result) => {
  if (!result.success) return result.message || 'Rule không thể chạy';
  if (result.skipped) return result.message || 'Rule đang được thực thi';
  if (result.triggered > 0) return `Rule đã trigger ${result.triggered} đối tượng`;
  const noTargets = result.debug.find(d => d.noTargets);
  if (noTargets) return noTargets.noTargetsReason || 'Không tìm thấy đối tượng để đánh giá';
  if (result.debug.some(d => d.skipped)) return 'Có đối tượng bị bỏ qua — xem lý do trong kết quả chạy';
  return 'Không có đối tượng nào thỏa điều kiện — xem chi tiết bên dưới';
};

// Keep every row and its original content; show triggered evaluations first, then unmet conditions.
export const groupRuleRunDetails = (details) => {
  const unmet = [], matched = [], skipped = [], diagnostics = [];
  for (const detail of details) {
    if (detail.skipped) skipped.push(detail);
    else if (detail.noTargets) diagnostics.push(detail);
    else if (detail.passed) matched.push(detail);
    else unmet.push(detail);
  }
  return { evaluated: [...matched, ...unmet, ...diagnostics], skipped };
};
