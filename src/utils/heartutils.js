// heartutils.js
// Các hàm tiện ích phục vụ cho phân tích và xử lý tín hiệu tim mạch

/**
 * Tính trung bình trong khoảng thời gian gần đây (5s)
 * @param {Array} data - danh sách dữ liệu đo (dạng [{bpm, spo2, temp, timestamp}])
 * @param {Number} window - cửa sổ tính trung bình (ms)
 */
export function getRecentAverage(data, window = 5000) {
  const now = Date.now();
  const recent = data.filter(d => now - d.timestamp <= window);
  if (recent.length === 0) return null;

  const avg = {
    bpm: recent.reduce((sum, d) => sum + d.bpm, 0) / recent.length,
    spo2: recent.reduce((sum, d) => sum + d.spo2, 0) / recent.length,
    temp: recent.reduce((sum, d) => sum + d.temp, 0) / recent.length,
  };
  return avg;
}

/**
 * Kiểm tra biến động lớn so với trung bình gần đây
 * @param {Object} current - dữ liệu hiện tại {bpm, spo2, temp}
 * @param {Object} avg - trung bình 5s gần nhất
 * @param {Number} threshold - phần trăm thay đổi cho phép
 */
export function detectSignificantChange(current, avg, threshold = 0.15) {
  if (!avg) return false;
  const bpmChange = Math.abs(current.bpm - avg.bpm) / avg.bpm;
  const spo2Change = Math.abs(current.spo2 - avg.spo2) / avg.spo2;
  const tempChange = Math.abs(current.temp - avg.temp) / avg.temp;

  return bpmChange > threshold || spo2Change > threshold || tempChange > threshold;
}

/**
 * Hàm tạo âm báo hoặc cảnh báo
 * @param {String} type - loại cảnh báo: "info" | "warning" | "error"
 * @param {String} message - nội dung
 */
export function triggerAlert(type, message) {
  switch (type) {
    case "info":
      console.info("ℹ️ " + message);
      break;
    case "warning":
      console.warn("⚠️ " + message);
      break;
    case "error":
      console.error("🚨 " + message);
      break;
    default:
      console.log(message);
  }
}

/**
 * Tạo popup cảnh báo xác nhận đổi trạng thái
 */
export function showActivityChangePopup(suggestedActivity, onConfirm, onReject, onTimeout) {
  const popup = document.createElement("div");
  popup.className = "activity-popup";
  popup.innerHTML = `
    <div class="popup-content">
      <p>Bạn đang ${suggestedActivity} phải không?</p>
      <button id="confirmYes">Có</button>
      <button id="confirmNo">Không</button>
    </div>
  `;
  document.body.appendChild(popup);

  const yesBtn = popup.querySelector("#confirmYes");
  const noBtn = popup.querySelector("#confirmNo");

  const timer = setTimeout(() => {
    popup.remove();
    if (onTimeout) onTimeout();
  }, 10000);

  yesBtn.addEventListener("click", () => {
    clearTimeout(timer);
    popup.remove();
    if (onConfirm) onConfirm();
  });

  noBtn.addEventListener("click", () => {
    clearTimeout(timer);
    popup.remove();
    if (onReject) onReject();
  });
}

/**
 * Cập nhật giao diện ngưỡng động
 */
export function updateThresholdDisplay(activity, thresholds) {
  const el = document.getElementById("thresholdDisplay");
  if (!el) return;
  const t = thresholds[activity];
  el.innerText = `Ngưỡng hiện tại: ${activity.toUpperCase()} 
  (BPM: ${t.bpmMin}-${t.bpmMax}, SpO₂ ≥ ${t.spo2Min}, Nhiệt độ ≤ ${t.tempMax})`;
}
