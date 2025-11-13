import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import Navbar from "./Navbar";
import Hero from "./Hero";
import { activityThresholds, analyzeHeartData, getSuggestedActivity } from "../utils/heartrules";
import mqtt from "mqtt";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Label,
} from "recharts";
import "./Home.css";
import { motion } from "framer-motion";

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [bpm, setBpm] = useState(null);
  const [spo2, setSpo2] = useState(null);
  const [temp, setTemp] = useState(null);
  const [ir, setIr] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartType, setChartType] = useState("BPM");

  const lastValueRef = useRef({ bpm: 0, spo2: 0, ir: 0, temp: 0 });
  const [status, setStatus] = useState({ text: "Không tìm thấy dữ liệu", type: "none" });
  const [isNoData, setIsNoData] = useState(false);

  const [uid, setUid] = useState(null);
  const [activityMode, setActivityMode] = useState("Nghỉ ngơi");
  const [showActivityDropdown, setShowActivityDropdown] = useState(false);
  const [showWarningPopup, setShowWarningPopup] = useState(false);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [showAlertPopup, setShowAlertPopup] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [countdownTime, setCountdownTime] = useState(10);
  const [recentBpmValues, setRecentBpmValues] = useState([]);
  const [suggestedActivity, setSuggestedActivity] = useState(null);
  const [thresholdExceedCount, setThresholdExceedCount] = useState(0); // Track consecutive threshold breaches
  const [isDataPausedForPopup, setIsDataPausedForPopup] = useState(false); // Pause data during popup
  
  // Refs for timers
  const warningTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const noDataTimerRef = useRef(null);
  const dataPauseTimerRef = useRef(null);

  // Activity thresholds
  const activityThresholds = {
    "Nghỉ ngơi": { min: 60, max: 94 },
    "Hoạt động nhẹ": { min: 95, max: 120 },
    "Vận động mạnh": { min: 121, max: 160 },
    "Ngủ": { min: 50, max: 85 }
  };

  // ✅ Check auth và lấy UID
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoading(false);
      if (!user) {
        navigate("/signin");
      } else {
        setUid(user.uid);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // ✅ Hàm cập nhật activity mode và lưu vào Firestore
  const updateActivityMode = async (newActivity) => {
    setActivityMode(newActivity);
    if (uid) {
      try {
        const userDocRef = doc(db, "users", uid);
        await updateDoc(userDocRef, {
          activityMode: newActivity,
          lastActivityUpdate: new Date().toISOString()
        });
        console.log("Activity mode updated in Firestore:", newActivity);
      } catch (error) {
        console.error("Error updating activity mode:", error);
      }
    }
  };

  // ✅ MQTT connect (update chart theo gói dữ liệu)
  useEffect(() => {
    if (!uid) return; // đợi có UID mới kết nối MQTT

    // Khôi phục dữ liệu từ localStorage nếu có
    const savedData = localStorage.getItem("healthData");
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      setChartData(parsedData.chartData || []);
      lastValueRef.current = parsedData.lastValue || { bpm: 0, spo2: 0, ir: 0, temp: 0 };
      setBpm(parsedData.lastValue?.bpm || null);
      setSpo2(parsedData.lastValue?.spo2 || null);
      setTemp(parsedData.lastValue?.temp || null);
      setIr(parsedData.lastValue?.ir || null);
    }

    const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt");

    client.on("connect", () => {
      console.log("Connected to MQTT");
      // ✅ Subscribe theo UID
      client.subscribe(`thongtinbenhnhan/${uid}`);
    });

    const handleMessage = (topic, message) => {
      try {
        // If popup is showing and data is paused, skip processing
        if (isDataPausedForPopup) {
          console.log("Data paused during popup confirmation - skipping");
          return;
        }

        const data = JSON.parse(message.toString());
        const newBpm = data.BPM !== -999 ? data.BPM : lastValueRef.current.bpm;
        const newSpo2 = data.SpO2 !== -999 ? data.SpO2 : lastValueRef.current.spo2;
        const newTemp = data.TempC !== -999 ? data.TempC : lastValueRef.current.temp;
        const newIr = data.IR !== -999 ? data.IR : lastValueRef.current.ir;

        // lưu giá trị mới vào ref
        const newValues = { bpm: newBpm, spo2: newSpo2, ir: newIr, temp: newTemp };
        lastValueRef.current = newValues;

        // clear no-data state because we just received data
        if (isNoData) {
          setIsNoData(false);
        }

        // Reset/refresh the no-data timer whenever a message arrives
        if (noDataTimerRef.current) {
          clearTimeout(noDataTimerRef.current);
        }
        // If no message arrives within 3s, reset values and push a zero datapoint to chart
        noDataTimerRef.current = setTimeout(() => {
          const zeroValues = { bpm: 0, spo2: 0, ir: 0, temp: 0 };
          lastValueRef.current = zeroValues;
          setBpm(0);
          setSpo2(0);
          setTemp(0);
          setIr(0);

          // mark no data state and set a visible status card
          setIsNoData(true);
          setStatus({ text: "Chưa nhận dữ liệu từ cảm biến", type: "none" });

          const nowZero = new Date().toLocaleTimeString("vi-VN", {
            hour12: false,
            timeStyle: "medium",
          });

          // push a zero point so chart reflects no-data
          setChartData(prev => {
            const newChartData = [...prev.slice(-49), { time: nowZero, bpm: 0, spo2: 0, ir: 0 }];
            // also update localStorage similar to normal flow
            const dataToStore = {
              chartData: newChartData,
              lastValue: zeroValues,
              timestamp: nowZero,
            };
            localStorage.setItem("healthData", JSON.stringify(dataToStore));
            return newChartData;
          });
        }, 3000);

        // ✅ update chart ngay (theo đúng tốc độ MQTT 0.1s)
        const now = new Date().toLocaleTimeString("vi-VN", {
          hour12: false,
          timeStyle: "medium",
        });

        setChartData((prev) => {
          const newChartData = [
            ...prev.slice(-49),
            {
              time: now,
              bpm: newBpm,
              spo2: newSpo2,
              ir: newIr,
            },
          ];

          // Lưu vào localStorage
          const dataToStore = {
            chartData: newChartData,
            lastValue: newValues,
            timestamp: now,
          };
          localStorage.setItem("healthData", JSON.stringify(dataToStore));

          return newChartData;
        });

        // Cập nhật các giá trị hiện tại
        setBpm(newBpm);
        setSpo2(newSpo2);
        setTemp(newTemp);
        setIr(newIr);
      } catch (err) {
        console.error("Error parsing MQTT:", err);
      }
    };

    client.on("message", handleMessage);

    return () => {
      client.unsubscribe(`thongtinbenhnhan/${uid}`);
      if (noDataTimerRef.current) {
        clearTimeout(noDataTimerRef.current);
        noDataTimerRef.current = null;
      }
      client.end();
    };
  }, [uid]);

  // Theo dõi BPM gần đây và kiểm tra ngưỡng
  useEffect(() => {
    if (bpm === null) return;

    // Phân tích dữ liệu hiện tại
    const analysis = analyzeHeartData(bpm, spo2, temp, activityMode);
    const hasWarning = analysis.warnings.length > 0;

    // If popup is showing, skip threshold checking
    if (showWarningPopup || isDataPausedForPopup) {
      return;
    }

    if (hasWarning) {
      // Tăng counter khi có cảnh báo
      setThresholdExceedCount(prev => {
        const newCount = prev + 1;
        console.log(`Threshold exceeded: ${newCount}/10`);

        // Khi đạt 10 lần vượt ngưỡng, hiển thị popup
        if (newCount >= 10) {
          setSuggestedActivity(analysis.suggestedActivity);
          setCountdownTime(10);
          setShowWarningPopup(true);
          setIsDataPausedForPopup(true); // Pause data intake
          
          // Clear old timers
          if (warningTimerRef.current) {
            clearTimeout(warningTimerRef.current);
            warningTimerRef.current = null;
          }
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }

          // Start countdown
          const countdownInterval = setInterval(() => {
            setCountdownTime(prev => {
              const newCount = prev - 1;
              if (newCount <= 0) {
                clearInterval(countdownInterval);
                if (showWarningPopup) {
                  setShowWarningPopup(false);
                  setShowAlertPopup(true);
                  setIsDataPausedForPopup(false); // Resume data
                }
                return 0;
              }
              setWarningMessage(`Bạn đang ${analysis.suggestedActivity.toLowerCase()} phải không? (${newCount}s)`);
              return newCount;
            });
          }, 1000);

          // Set initial message
          setWarningMessage(`Bạn đang ${analysis.suggestedActivity.toLowerCase()} phải không? (10s)`);

          // Auto close popup after 10 seconds
          const warningTimeout = setTimeout(() => {
            if (showWarningPopup) {
              setShowWarningPopup(false);
              setShowAlertPopup(true);
              setStatus({ 
                text: "Báo động! Nhịp tim cực kì bất thường", 
                type: "alert" 
              });
              setIsDataPausedForPopup(false); // Resume data
            }
          }, 10000);

          countdownTimerRef.current = countdownInterval;
          warningTimerRef.current = warningTimeout;

          // Reset counter
          return 0;
        }
        return newCount;
      });
    } else {
      // Reset counter when no warning
      setThresholdExceedCount(0);
    }

    // Cleanup
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [bpm, activityMode, spo2, temp, showWarningPopup, isDataPausedForPopup]);

  // thêm useEffect để cập nhật trạng thái
  useEffect(() => {
    if (isNoData) return; // don't override the explicit no-data status

    if (bpm === null || spo2 === null || temp === null) {
      setStatus({ text: "Không tìm thấy dữ liệu", type: "none" });
    } else {
      const analysis = analyzeHeartData(bpm, spo2, temp, activityMode);
      
      if (analysis.warnings.length === 0) {
        setStatus({ 
          text: `Trạng thái: ổn định (${activityMode})`, 
          type: "normal" 
        });
      } else {
        if (!showWarningPopup && !showAlertPopup) {
          setStatus({ 
            text: `Trạng thái: ${analysis.warnings.join(", ")}`, 
            type: "alert" 
          });
        }
      }
    }
  }, [bpm, spo2, temp, activityMode, showWarningPopup, showAlertPopup]);

  // ✅ Card update mỗi 1s (không phụ thuộc tốc độ MQTT)
  useEffect(() => {
    const interval = setInterval(() => {
      setBpm(lastValueRef.current.bpm);
      setSpo2(lastValueRef.current.spo2);
      setTemp(lastValueRef.current.temp);
      setIr(lastValueRef.current.ir);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // ✅ Custom Line component animate theo path d
  const MotionLine = ({ path, stroke }) => (
    <motion.path
      d={path}
      stroke={stroke}
      strokeWidth="2"
      fill="none"
      animate={{ d: path }}
      transition={{ duration: 0.1, ease: "linear" }}
    />
  );

  return (
    <>
      <Navbar />
      <Hero status={status} />
      <div className="home-container">
        {/* LEFT */}
        <div className="left-panel">
          <h2 className="section-title">Chỉ số hiện tại</h2>
          <div className="activity-button" onClick={() => setShowActivityDropdown(!showActivityDropdown)}>
            Chế độ vận động: {activityMode}
            {showActivityDropdown && (
              <div className="activity-dropdown">
                {Object.keys(activityThresholds).map(mode => (
                  <div 
                    key={mode} 
                    className="activity-option"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateActivityMode(mode);
                      setShowActivityDropdown(false);
                    }}
                  >
                    {mode}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {showWarningPopup && (
            <div className="popup-overlay">
              <div className="popup-content">
                <div className="countdown-display">{countdownTime}s</div>
                <h3>Bạn đang {suggestedActivity?.toLowerCase()} phải không?</h3>
                <div className="popup-buttons">
                  <button onClick={() => {
                    // Clear all timers
                    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
                    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                    if (dataPauseTimerRef.current) clearTimeout(dataPauseTimerRef.current);
                    
                    setShowWarningPopup(false);
                    updateActivityMode(suggestedActivity);
                    setStatus({ 
                      text: `Trạng thái: ${suggestedActivity} - Đã cập nhật trạng thái`, 
                      type: "normal" 
                    });
                    setThresholdExceedCount(0); // Reset counter
                    setIsDataPausedForPopup(false); // Resume data
                  }}>Có</button>
                  <button onClick={() => {
                    // Clear all timers
                    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
                    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                    if (dataPauseTimerRef.current) clearTimeout(dataPauseTimerRef.current);
                    
                    setShowWarningPopup(false);
                    setShowErrorPopup(true);
                    setThresholdExceedCount(0); // Reset counter
                    setIsDataPausedForPopup(false); // Resume data
                  }}>Không</button>
                </div>
              </div>
            </div>
          )}

          {showErrorPopup && (
            <div className="popup-overlay">
              <div className="popup-content error">
                <h3>Lỗi thiết bị, vui lòng kiểm tra</h3>
                <button onClick={() => {
                  setShowErrorPopup(false);
                  setThresholdExceedCount(0); // Reset counter
                  setIsDataPausedForPopup(false); // Resume data
                }}>Đóng</button>
              </div>
            </div>
          )}

          {showAlertPopup && (
            <div className="popup-overlay">
              <div className="popup-content alert">
                <h3>Báo động! Nhịp tim cực kì bất thường</h3>
                <button onClick={() => {
                  setShowAlertPopup(false);
                  setThresholdExceedCount(0); // Reset counter
                  setIsDataPausedForPopup(false); // Resume data
                }}>Đóng</button>
              </div>
            </div>
          )}

          <div className="info-card heart">
            <div className="icon">❤️</div>
            <div className="info-content">
              <p className="info-title">Nhịp tim</p>
              <p className="info-value">{bpm ?? "--"} BPM</p>
            </div>
          </div>

          <div className="info-card spo2">
            <div className="icon">🫁</div>
            <div className="info-content">
              <p className="info-title">SpO₂</p>
              <p className="info-value">{spo2 ?? "--"} %</p>
            </div>
          </div>

          <div className="info-card temp">
            <div className="icon">🌡️</div>
            <div className="info-content">
              <p className="info-title">Nhiệt độ</p>
              <p className="info-value">{temp ?? "--"} °C</p>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="right-panel">
          <div className="chart-toggle">
            <button
              className={chartType === "BPM" ? "active" : ""}
              onClick={() => setChartType("BPM")}
            >
              Sơ đồ nhịp tim
            </button>
            <button
              className={chartType === "SpO2" ? "active" : ""}
              onClick={() => setChartType("SpO2")}
            >
              Sơ đồ SpO₂
            </button>
            <button
              className={chartType === "IR" ? "active" : ""}
              onClick={() => setChartType("IR")}
            >
              Sơ đồ tín hiệu PPG
            </button>
          </div>

          <h3>
            {chartType === "BPM"
              ? "Sơ đồ nhịp tim"
              : chartType === "SpO2"
              ? "Sơ đồ SpO₂"
              : "Sơ đồ tín hiệu PPG"}
          </h3>

          <ResponsiveContainer width="100%" height={350}>
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
              style={{ backgroundColor: "#fff" }}
            >
              <motion.g
                key={chartData.length}
                initial={{ x: 0 }}
                animate={{ x: -15 }}
                transition={{ duration: 0.12, ease: "linear" }}
              >
                <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#333", fontSize: 12 }}
                  axisLine={{ stroke: "#333" }}
                >
                  <Label
                    value="Thời gian"
                    offset={-5}
                    position="insideBottom"
                    fill="#333"
                  />
                </XAxis>

                {chartType === "BPM" && (
                  <YAxis
                    domain={[40, 140]}
                    tick={{ fill: "#333", fontSize: 12 }}
                    axisLine={{ stroke: "#333" }}
                  >
                    <Label
                      value="BPM"
                      angle={-90}
                      position="insideLeft"
                      fill="#333"
                    />
                  </YAxis>
                )}
                {chartType === "SpO2" && (
                  <YAxis
                    domain={[80, 100]}
                    tick={{ fill: "#333", fontSize: 12 }}
                    axisLine={{ stroke: "#333" }}
                  >
                    <Label
                      value="%"
                      angle={-90}
                      position="insideLeft"
                      fill="#333"
                    />
                  </YAxis>
                )}
                {chartType === "IR" && (
                  <YAxis
                    tick={{ fill: "#333", fontSize: 12 }}
                    axisLine={{ stroke: "#333" }}
                  >
                    <Label
                      value="PPG"
                      angle={-90}
                      position="insideLeft"
                      fill="#333"
                    />
                  </YAxis>
                )}

                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #ccc" }}
                  labelStyle={{ color: "#333" }}
                  itemStyle={{ color: "#333" }}
                />

                {chartType === "BPM" && (
                  <Line
                    type="monotone"
                    dataKey="bpm"
                    stroke="#00b300"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    content={({ points }) => {
                      const path = `M${points
                        .map((p) => `${p.x},${p.y}`)
                        .join("L")}`;
                      return <MotionLine path={path} stroke="#00b300" />;
                    }}
                  />
                )}
                {chartType === "SpO2" && (
                  <Line
                    type="monotone"
                    dataKey="spo2"
                    stroke="#00bfff"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    content={({ points }) => {
                      const path = `M${points
                        .map((p) => `${p.x},${p.y}`)
                        .join("L")}`;
                      return <MotionLine path={path} stroke="#00bfff" />;
                    }}
                  />
                )}
                {chartType === "IR" && (
                  <Line
                    type="monotone"
                    dataKey="ir"
                    stroke="#ff9900"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    content={({ points }) => {
                      const path = `M${points
                        .map((p) => `${p.x},${p.y}`)
                        .join("L")}`;
                      return <MotionLine path={path} stroke="#ff9900" />;
                    }}
                  />
                )}
              </motion.g>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
