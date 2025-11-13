// heartrules.js
// Quy tắc phân tích tim mạch theo trạng thái và gợi ý hoạt động

export const activityThresholds = {
  "Nghỉ ngơi": { min: 60, max: 100, spo2Min: 95 },
  "Hoạt động nhẹ": { min: 70, max: 120, spo2Min: 94 },
  "Vận động mạnh": { min: 90, max: 160, spo2Min: 92 },
  "Ngủ": { min: 50, max: 85, spo2Min: 95 }
};

export function getSuggestedActivity(bpm) {
  // Gợi ý hoạt động dựa trên nhịp tim
  if (bpm >= 60 && bpm < 85) return "Ngủ";
  if (bpm >= 60 && bpm < 94) return "Nghỉ ngơi";
  if (bpm >= 95 && bpm < 120) return "Hoạt động nhẹ";
  if (bpm >= 121 && bpm < 160) return "Vận động mạnh";
  return "Nghỉ ngơi"; // Mặc định về trạng thái nghỉ ngơi
}

export function analyzeHeartData(bpm, spo2, temp, currentActivity) {
  const thresholds = activityThresholds[currentActivity] || activityThresholds["Nghỉ ngơi"];
  const warnings = [];

  if (bpm < thresholds.min || bpm > thresholds.max) {
    warnings.push("Nhịp tim bất thường");
  }
  if (spo2 < thresholds.spo2Min) {
    warnings.push("SpO2 thấp");
  }

  const status = warnings.length > 0 ? "Cảnh báo" : "Bình thường";
  const suggestedActivity = getSuggestedActivity(bpm);

  return {
    status,
    warnings,
    currentActivity,
    suggestedActivity,
    isActivityChange: suggestedActivity !== currentActivity
  };
}

// Điều chỉnh ngưỡng động khi người dùng xác nhận thay đổi
export function adjustThresholds(thresholds, newActivity) {
  const updated = { ...thresholds };
  updated.current = newActivity;
  return updated;
}
