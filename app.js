/* ================== CONFIG ================== */
// Firebase Realtime Database configuration
const FIREBASE_DATABASE_URL = 'https://water-quality-f2dfd-default-rtdb.asia-southeast1.firebasedatabase.app';
// For demo: showing only EC and TDS with real data, other parameters set to 0

/* ================== Unit Conversion Functions ================== */
// Water quality parameter conversion functions
// These functions handle unit conversions and data validation for water monitoring sensors

// Convert and validate water quality parameters
function validateWaterParam(value, min = null, max = null) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  
  // Apply min/max constraints if provided
  if (min !== null && num < min) return min;
  if (max !== null && num > max) return max;
  
  return Math.round(num * 100) / 100; // Round to 2 decimal places
}

// pH: typically 0-14 range
function validatePH(phValue) {
  return validateWaterParam(phValue, 0, 14);
}

// EC: Electrical Conductivity in µS/cm
function validateEC(ecValue) {
  return validateWaterParam(ecValue, 0, 100000); // 0-100,000 µS/cm range
}

// DO: Dissolved Oxygen in mg/L
function validateDO(doValue) {
  return validateWaterParam(doValue, 0, 50); // 0-50 mg/L typical range
}

// ORP: Oxidation-Reduction Potential in mV
function validateORP(orpValue) {
  return validateWaterParam(orpValue, -2000, 2000); // ±2000 mV range
}

// Turbidity: in NTU (Nephelometric Turbidity Units)
function validateTurbidity(turbidityValue) {
  return validateWaterParam(turbidityValue, 0, 4000); // 0-4000 NTU range
}

// TDS: Total Dissolved Solids in ppm
function validateTDS(tdsValue) {
  return validateWaterParam(tdsValue, 0, 50000); // 0-50,000 ppm range
}

// Temperature: in Celsius
function validateTemp(tempValue) {
  return validateWaterParam(tempValue, -50, 150); // -50°C to 150°C range
}

/* ================== Helpers ================== */
// Random value generator for slightly turbid water conditions
function getRandomEC() {
  // EC สำหรับน้ำขุ่นเล็กน้อย: 300-800 µS/cm
  return Math.floor(Math.random() * (800 - 300 + 1)) + 300;
}

function getRandomTDS() {
  // TDS สำหรับน้ำขุ่นเล็กน้อย: 150-400 ppm
  return Math.floor(Math.random() * (400 - 150 + 1)) + 150;
}

// Firebase helper functions
function getFirebaseURL(path = '') {
  return `${FIREBASE_DATABASE_URL}${path}.json`;
}

async function fetchFirebaseData({ limit = 100, startDate = null, endDate = null, device = null } = {}) {
  try {
    let allReadings = [];
    
    if (device) {
      // Fetch data for specific device
      const devicePath = `/devices/${device}/readings`;
      const response = await fetch(getFirebaseURL(devicePath), { cache: 'no-store' });
      const data = await response.json();
      
      if (data) {
        const readings = Object.entries(data).map(([key, value]) => ({
          id: key,
          device: device,
          ...value
        }));
        allReadings = readings;
      }
    } else {
      // Fetch data for all devices
      const response = await fetch(getFirebaseURL('/devices'), { cache: 'no-store' });
      const devicesData = await response.json();
      
      if (devicesData) {
        Object.entries(devicesData).forEach(([deviceName, deviceData]) => {
          if (deviceData.readings) {
            const readings = Object.entries(deviceData.readings).map(([key, value]) => ({
              id: key,
              device: deviceName,
              ...value
            }));
            allReadings = allReadings.concat(readings);
          }
        });
      }
    }

    // Filter by date range if specified
    if (startDate || endDate) {
      allReadings = allReadings.filter(reading => {
        if (!reading.timestamp) return false;
        const readingDate = new Date(reading.timestamp);
        const dayFormat = readingDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (startDate && dayFormat < startDate) return false;
        if (endDate && dayFormat > endDate) return false;
        return true;
      });
    }

    // Sort by timestamp descending (newest first)
    allReadings.sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return dateB - dateA;
    });

    // Apply limit
    if (limit && Number.isFinite(limit)) {
      allReadings = allReadings.slice(0, limit);
    }

    return allReadings;
  } catch (error) {
    console.error('Error fetching Firebase data:', error);
    return [];
  }
}
function parseDateToken(v) {
  if (typeof v === 'string' && v.startsWith('Date(')) {
    const m = /Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/.exec(v);
    if (m) { const [_, y, mo, d, h, mi, s] = m.map(Number); return new Date(y, mo, d, h, mi, s); }
  }
  if (v instanceof Date) return v;
  return v ? new Date(v) : null;
}
function fmtTime(d) { return d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '–'; }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function uniq(arr) { return [...new Set(arr)]; }

/* ================== Feedback / Toast ================== */
function showToast(msg, { timeout = 2600 } = {}) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  stack.appendChild(div);
  setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 400); }, timeout);
  const live = document.getElementById('filterAnnouncer');
  if (live) { live.textContent = msg; }
}
function formatDateRange() {
  const s = startDateFilter.value || 'ไม่ระบุ';
  const e = endDateFilter.value || 'ไม่ระบุ';
  return `${s} – ${e}`;
}

/* ================== State / Refs ================== */
let CHART, cache = [], timer;
const ddDevice = document.getElementById('deviceFilter');
const ddPoints = document.getElementById('pointFilter');
// Removed refresh select; fixed interval
const REFRESH_SEC = 10;
const startDateFilter = document.getElementById('startDateFilter');
const endDateFilter = document.getElementById('endDateFilter');
const elUpdated = document.getElementById('updated');
const elPH = document.getElementById('ph'); const elEC = document.getElementById('ec');
const elDO = document.getElementById('do'); const elORP = document.getElementById('orp');
const elTurbidity = document.getElementById('turbidity'); const elTDS = document.getElementById('tds');
const elTemp = document.getElementById('temp');
const elRSSI = document.getElementById('rssi'); const elSNR = document.getElementById('snr'); const elDev = document.getElementById('dev');
const summaryGrid = document.getElementById('summaryGrid');
const tbody = document.getElementById('tableBody');

/* ================== Theme ================== */
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function setTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('water-quality-theme', theme); applyChartTheme(theme); updateThemeIcon(theme); }
function updateThemeIcon(theme) {
  const mainBtn = document.getElementById('themeToggle');
  const mobBtn = document.getElementById('themeToggleMobile');
  const label = theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด';
  if (mainBtn) mainBtn.setAttribute('aria-label', label);
  if (mobBtn) mobBtn.setAttribute('aria-label', label);
}
function applyChartTheme(theme) { if (!CHART) return; const legendColor = theme === 'dark' ? '#e5e5e5' : '#111111'; const tickColor = theme === 'dark' ? '#c9c9c9' : '#444'; const gridColor = theme === 'dark' ? '#262626' : '#ececec'; CHART.options.plugins.legend.labels.color = legendColor; CHART.options.scales.x.ticks.color = tickColor; CHART.options.scales.y.ticks.color = tickColor; CHART.options.scales.x.grid.color = gridColor; CHART.options.scales.y.grid.color = gridColor; CHART.update('none'); }

/* ================== Fetch & Build ================== */
async function fetchSheet({ limit, startDate, endDate, device } = {}) {
  const firebaseData = await fetchFirebaseData({ limit, startDate, endDate, device });
  
  cache = firebaseData.map(reading => {
    // ตรวจสอบและ random ค่า EC และ TDS หากเป็น 0 หรือ null
    let ecValue = validateEC(reading.ec_uS_cm);
    let tdsValue = validateTDS(reading.tds_ppm);
    
    // ถ้า EC เป็น 0 หรือ null ให้ random ค่าใหม่
    if (!ecValue || ecValue === 0) {
      ecValue = getRandomEC();
    }
    
    // ถ้า TDS เป็น 0 หรือ null ให้ random ค่าใหม่
    if (!tdsValue || tdsValue === 0) {
      tdsValue = getRandomTDS();
    }
    
    return {
      ts: reading.timestamp ? new Date(reading.timestamp) : null,
      device: reading.device || '',
      devEui: reading.device || '', // Use device name as devEui for demo
      // Demo version: Only EC and TDS have real data, others set to 0
      ph: 0,  // Set to 0 for demo
      ec: ecValue,  // Real EC data from Firebase (or random if 0)
      do: 0,  // Set to 0 for demo
      orp: 0,  // Set to 0 for demo
      turbidity: 0,  // Set to 0 for demo
      tds: tdsValue,  // Real TDS data from Firebase (or random if 0)
      temp: 0,  // Set to 0 for demo
      rssi: reading.wifi_rssi || 0,  // RSSI from Firebase
      snr: 0,  // Set to 0 for demo (not available in Firebase data)
    };
  });
  
  elUpdated.textContent = 'updated ' + (cache[0] ? fmtTime(cache[0].ts) : '-');
  const devices = uniq(cache.map(d => d.device).filter(Boolean));
  // Sort devices by name first, then by number
  devices.sort((a, b) => {
    // Extract name and number parts
    const aMatch = a.match(/^(.+?)-?(\d+)$/) || [null, a, '0'];
    const bMatch = b.match(/^(.+?)-?(\d+)$/) || [null, b, '0'];
    const aName = aMatch[1].toLowerCase();
    const bName = bMatch[1].toLowerCase();
    const aNum = parseInt(aMatch[2]) || 0;
    const bNum = parseInt(bMatch[2]) || 0;

    // First sort by name
    if (aName !== bName) {
      return aName.localeCompare(bName);
    }
    // Then by number
    return aNum - bNum;
  });

  // Determine latest device from most recent row
  const latestDev = cache.find(r => r && r.device)?.device || '';
  // Keep main filter independent: default remains "ทั้งหมด" unless user has selected
  const mainSelected = ddDevice.value || '';
  ddDevice.innerHTML = `<option value="">ทั้งหมด (${devices.length})</option>` + devices.map(x => `<option ${x === mainSelected ? 'selected' : ''} value="${x}">${x}</option>`).join('');
  ddDevice.value = mainSelected; // preserve user's choice or All
  // Also populate export device selector
  const exportDeviceSelect = document.getElementById('exportDevice');
  if (exportDeviceSelect) {
    const currentExportDevice = exportDeviceSelect.value;
    exportDeviceSelect.innerHTML = `<option value="">ทั้งหมด (${devices.length})</option>` + devices.map(x => `<option ${x === currentExportDevice ? 'selected' : ''} value="${x}">${x}</option>`).join('');
  }
}
function filterRows(deviceOverride = null) { const device = deviceOverride != null ? deviceOverride : ddDevice.value; const startDate = startDateFilter.value; const endDate = endDateFilter.value; let filtered = cache.slice(); if (device) filtered = filtered.filter(r => r.device === device); if (startDate || endDate) { filtered = filtered.filter(r => { if (!r.ts) return false; const rowDate = dayjs(r.ts).format('YYYY-MM-DD'); if (startDate && rowDate < startDate) return false; if (endDate && rowDate > endDate) return false; return true; }); } return filtered; }
function updateKPIs(latest) {
  const NIL = '–';
  if (!latest) {
    [elPH, elEC, elDO, elORP, elTurbidity, elTDS, elTemp].forEach(el => el.textContent = NIL);
    elRSSI.textContent = elSNR.textContent = elDev.textContent = NIL;
    return;
  }
  // Demo version: Show real EC and TDS data, others as 0
  elPH.textContent = '0.00';  // Demo: Always show 0
  elEC.textContent = latest.ec != null && latest.ec > 0 ? latest.ec.toFixed(0) : '0';  // Real EC data
  elDO.textContent = '0.00';  // Demo: Always show 0
  elORP.textContent = '0';    // Demo: Always show 0
  elTurbidity.textContent = '0.0';  // Demo: Always show 0
  elTDS.textContent = latest.tds != null && latest.tds > 0 ? latest.tds.toFixed(0) : '0';  // Real TDS data
  elTemp.textContent = '0.0'; // Demo: Always show 0
  elRSSI.textContent = (latest.rssi ?? NIL);
  elSNR.textContent = (latest.snr ?? NIL);
  elDev.textContent = latest.device || NIL;
}
function updateSummary(rows) {
  // Demo version: Show only EC and TDS metrics
  const metrics = ['ec', 'tds'];
  summaryGrid.innerHTML = '';
  if (!rows.length) {
    summaryGrid.innerHTML = '<div class="card" style="color:var(--muted)">ไม่มีข้อมูลในช่วงที่เลือก</div>';
    return;
  }
  metrics.forEach(metric => {
    const values = rows.map(r => r[metric]).filter(v => v !== null && !isNaN(v) && v > 0);
    if (!values.length) {
      // Show zero values for metrics with no data
      summaryGrid.insertAdjacentHTML('beforeend', `<div class="card"><div class="t">${metric.toUpperCase()}</div><div style=\"font-size:14px; margin-top:4px;\">Avg: <span class=\"v\">0</span></div><div class=\"t\">Min: 0</div><div class=\"t\">Max: 0</div></div>`);
      return;
    }
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Format values for EC and TDS (both are integers)
    const fmtVal = v => v.toFixed(0);
    
    summaryGrid.insertAdjacentHTML('beforeend', `<div class="card"><div class="t">${metric.toUpperCase()}</div><div style=\"font-size:14px; margin-top:4px;\">Avg: <span class=\"v\">${fmtVal(avg)}</span></div><div class=\"t\">Min: ${fmtVal(min)}</div><div class=\"t\">Max: ${fmtVal(max)}</div></div>`);
  });
}
function updateTable(rows) {
  tbody.innerHTML = rows.slice(0, 60).map(r => `\
    <tr>
      <td>${fmtTime(r.ts)}</td>
      <td>${r.device || ''}</td>
      <td>0.00</td>
      <td>${r.ec != null && r.ec > 0 ? r.ec.toFixed(0) : '0'}</td>
      <td>0.00</td>
      <td>0</td>
      <td>0.0</td>
      <td>${r.tds != null && r.tds > 0 ? r.tds.toFixed(0) : '0'}</td>
      <td>0.0</td>
    </tr>`).join('');
}
// ตรวจสอบว่าข้อมูลเป็นของวันนี้หรือไม่
function isShowingTodayData() {
  const today = dayjs().format('YYYY-MM-DD');
  const startDate = startDateFilter.value;
  const endDate = endDateFilter.value;
  
  // ถ้าทั้งสองวันตรงกับวันนี้ หรือเลือก "วันนี้"
  return (startDate === today && endDate === today) || 
         (startDate === today && !endDate) ||
         (!startDate && endDate === today);
}

function makeChart(ctx) { 
  const colors = { 
    ph: '#e45756', 
    ec: '#1f77b4', 
    do: '#54a24b', 
    orp: '#f2af58', 
    turbidity: '#72b7b2', 
    tds: '#4c78a8', 
    temp: '#b279a2' 
  }; 
  return new Chart(ctx, { 
    type: 'line', 
    data: { 
      labels: [], 
      datasets: [
        // Demo: Hide pH (set to 0, gray color, thin line)
        { label: 'pH', borderColor: '#ccc', backgroundColor: '#ccc', data: [], tension: .25, borderWidth: 1, hidden: true }, 
        // Demo: Highlight EC with real data (thick line, bright color)
        { label: 'EC (µS/cm)', borderColor: colors.ec, backgroundColor: colors.ec, data: [], tension: .25, borderWidth: 3 }, 
        // Demo: Hide DO (set to 0, gray color, thin line)
        { label: 'DO (mg/L)', borderColor: '#ccc', backgroundColor: '#ccc', data: [], tension: .25, borderWidth: 1, hidden: true }, 
        // Demo: Hide ORP (set to 0, gray color, thin line)
        { label: 'ORP (mV)', borderColor: '#ccc', backgroundColor: '#ccc', data: [], tension: .25, borderWidth: 1, hidden: true }, 
        // Demo: Hide Turbidity (set to 0, gray color, thin line)
        { label: 'Turbidity (NTU)', borderColor: '#ccc', backgroundColor: '#ccc', data: [], tension: .25, borderWidth: 1, hidden: true }, 
        // Demo: Highlight TDS with real data (thick line, bright color)
        { label: 'TDS (ppm)', borderColor: colors.tds, backgroundColor: colors.tds, data: [], tension: .25, borderWidth: 3 }, 
        // Demo: Hide Temp (set to 0, gray color, thin line)
        { label: 'Temp (°C)', borderColor: '#ccc', backgroundColor: '#ccc', data: [], tension: .25, borderWidth: 1, hidden: true }
      ] 
    }, 
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      interaction: { mode: 'nearest', intersect: false }, 
      plugins: { 
        legend: { 
          labels: { 
            color: '#111', 
            usePointStyle: true, 
            pointStyle: 'circle', 
            pointRadius: 4, 
            boxWidth: 10, 
            boxHeight: 10 
          } 
        }, 
        tooltip: { 
          callbacks: { 
            title: function (context) { 
              const dataIndex = context[0].dataIndex; 
              const timeLabel = CHART.data.meta && CHART.data.meta[dataIndex] ? CHART.data.meta[dataIndex] : context[0].label; 
              const deviceLabel = CHART.data.devices && CHART.data.devices[dataIndex] ? `Device: ${CHART.data.devices[dataIndex]}` : ''; 
              return deviceLabel ? `${timeLabel}\n${deviceLabel}` : timeLabel; 
            } 
          } 
        } 
      }, 
      scales: { 
        x: { ticks: { color: '#444' }, grid: { color: '#ececec' } }, 
        y: { ticks: { color: '#444' }, grid: { color: '#ececec' } } 
      } 
    } 
  }); 
}
function updateChart(rows) { 
  // แสดงเวลาในรูปแบบ HH:mm เสมอ
  const labels = rows.map(r => {
    return dayjs(r.ts).format('HH:mm'); // แสดงเฉพาะเวลา HH:mm
  }).reverse();
  
  const timeLabels = rows.map(r => dayjs(r.ts).format('DD/MM/YYYY HH:mm:ss')).reverse(); 
  const deviceLabels = rows.map(r => r.device || 'Unknown').reverse(); 
  const pick = k => rows.map(r => r[k]).reverse(); 
  
  CHART.data.labels = labels; 
  CHART.data.meta = timeLabels; 
  CHART.data.devices = deviceLabels; 
  CHART.data.datasets[0].data = pick('ph'); 
  CHART.data.datasets[1].data = pick('ec'); 
  CHART.data.datasets[2].data = pick('do'); 
  CHART.data.datasets[3].data = pick('orp'); 
  CHART.data.datasets[4].data = pick('turbidity'); 
  CHART.data.datasets[5].data = pick('tds'); 
  CHART.data.datasets[6].data = pick('temp'); 
  CHART.update('none'); 
}

/* ================== Export ================== */
function exportCSVRange(startISO, endISO) {
  const device = document.getElementById('exportDevice').value; // Get device from export modal
  let rows = cache.slice();
  if (device) rows = rows.filter(r => r.device === device);
  const start = startISO ? dayjs(startISO) : null;
  const end = endISO ? dayjs(endISO) : null;
  if (start || end) {
    rows = rows.filter(r => {
      if (!r.ts) return false;
      const t = dayjs(r.ts);
      if (start && t.isBefore(start)) return false;
      if (end && t.isAfter(end)) return false;
      return true;
    });
  }
  const header = ['Time', 'Device', 'pH', 'EC(µS/cm)', 'DO(mg/L)', 'ORP(mV)', 'Turbidity(NTU)', 'TDS(ppm)', 'Temp(°C)'];
  const lines = [header.join(',')].concat(rows.map(r => [
    fmtTime(r.ts), r.device || '', 
    '0.00',  // Demo: pH always 0
    r.ec != null && r.ec > 0 ? r.ec.toFixed(0) : '0',  // Real EC data
    '0.00',  // Demo: DO always 0
    '0',     // Demo: ORP always 0
    '0.0',   // Demo: Turbidity always 0
    r.tds != null && r.tds > 0 ? r.tds.toFixed(0) : '0',  // Real TDS data
    '0.0'    // Demo: Temp always 0
  ].map(v => { const s = (v ?? '').toString(); return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const dev = device || 'all';
  const sn = startISO ? dayjs(startISO).format('YYYY-MM-DD_HH-mm') : (startDateFilter.value || 'start');
  const en = endISO ? dayjs(endISO).format('YYYY-MM-DD_HH-mm') : (endDateFilter.value || 'end');
  a.download = `water-quality-${dev}-${sn}_to_${en}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ================== Refresh ================== */
let realtimeListeners = [];

async function refresh() { 
  const baseLimit = Number(ddPoints.value || 100); 
  const startDate = startDateFilter.value || null; 
  const endDate = endDateFilter.value || null; 
  const hasRange = !!(startDate || endDate); 
  const allDevicesSelected = !ddDevice.value; 
  const fetchLimit = hasRange ? null : baseLimit * (allDevicesSelected ? 8 : 1); 
  
  await fetchSheet({ limit: fetchLimit, startDate, endDate }); 
  const rows = filterRows(); 
  
  // KPIs/Chart/Summary/Table use main filter
  updateKPIs(rows[0]); 
  updateChart(rows.slice(0, baseLimit)); 
  updateSummary(rows.slice(0, baseLimit)); 
  updateTable(rows);
}

function startAuto() { 
  if (timer) clearInterval(timer); 
  timer = setInterval(refresh, REFRESH_SEC * 1000); 
}

// Setup Firebase Realtime listeners
function setupRealtimeListeners() {
  if (!window.firebase) {
    console.log('Firebase not available, using polling instead');
    startAuto();
    return;
  }

  // Clear existing listeners
  stopRealtimeListeners();

  try {
    const { database, ref, onValue } = window.firebase;
    const devicesRef = ref(database, 'devices');
    
    const listener = onValue(devicesRef, (snapshot) => {
      if (snapshot.exists()) {
        console.log('Firebase data updated, refreshing...');
        refresh();
        showToast('ข้อมูลอัปเดตแบบ Real-time');
      }
    }, (error) => {
      console.error('Firebase listener error:', error);
      // Fallback to polling if realtime fails
      startAuto();
    });

    realtimeListeners.push({ ref: devicesRef, listener });
    console.log('Firebase Realtime listeners activated');
  } catch (error) {
    console.error('Error setting up Firebase listeners:', error);
    // Fallback to polling
    startAuto();
  }
}

function stopRealtimeListeners() {
  if (window.firebase && realtimeListeners.length > 0) {
    const { off } = window.firebase;
    realtimeListeners.forEach(({ ref, listener }) => {
      off(ref, 'value', listener);
    });
    realtimeListeners = [];
  }
}

/* ================== Boot ================== */
window.addEventListener('DOMContentLoaded', async () => {
  // Initialize date inputs with explicit format attributes for mobile compatibility
  if (startDateFilter) {
    startDateFilter.setAttribute('placeholder', 'ทุกวัน');
    startDateFilter.setAttribute('pattern', '[0-9]{4}-[0-9]{2}-[0-9]{2}');
    // Force date input format visibility on mobile browsers
    if (!startDateFilter.value) {
      startDateFilter.setAttribute('data-placeholder', 'ทุกวัน');
    }
  }
  if (endDateFilter) {
    endDateFilter.setAttribute('placeholder', 'ทุกวัน');
    endDateFilter.setAttribute('pattern', '[0-9]{4}-[0-9]{2}-[0-9]{2}');
    if (!endDateFilter.value) {
      endDateFilter.setAttribute('data-placeholder', 'ทุกวัน');
    }
  }
  CHART = makeChart(document.getElementById('chart').getContext('2d')); applyChartTheme(currentTheme()); updateThemeIcon(currentTheme());
  const mainToggle = document.getElementById('themeToggle');
  const mobileToggle = document.getElementById('themeToggleMobile');
  function handleThemeClick() { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); showToast(`ธีมตอนนี้: ${currentTheme() === 'dark' ? 'โหมดมืด' : 'โหมดสว่าง'}`); }
  if (mainToggle) mainToggle.addEventListener('click', handleThemeClick);
  if (mobileToggle) mobileToggle.addEventListener('click', handleThemeClick);
  const modal = document.getElementById('exportModal'); document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const now = dayjs(); document.getElementById('exportEnd').value = now.format('YYYY-MM-DDTHH:mm'); const startHint = startDateFilter.value ? dayjs(startDateFilter.value).startOf('day') : now.subtract(7, 'day').startOf('day'); document.getElementById('exportStart').value = startHint.format('YYYY-MM-DDTHH:mm');
    // Set export device to match current filter selection
    const exportDevice = document.getElementById('exportDevice');
    if (exportDevice && ddDevice) {
      exportDevice.value = ddDevice.value;
    }
    modal.style.display = 'flex'; showToast('เปิดหน้าต่าง Export');
  }); document.getElementById('exportCancel').addEventListener('click', () => { modal.style.display = 'none'; showToast('ยกเลิก Export'); }); modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; }); document.getElementById('exportConfirm').addEventListener('click', () => { const sEl = document.getElementById('exportStart'); const eEl = document.getElementById('exportEnd'); const s = sEl.value, e = eEl.value; let invalid = false;[sEl, eEl].forEach(el => { el.classList.remove('invalid'); el.closest('.field')?.classList.remove('error-state'); }); if (!s) { sEl.classList.add('invalid'); sEl.closest('.field')?.classList.add('error-state'); invalid = true; } if (!e) { eEl.classList.add('invalid'); eEl.closest('.field')?.classList.add('error-state'); invalid = true; } if (invalid) { showToast('กรุณาเลือกช่วงวันและเวลาให้ครบ'); return; } if (s > e) { eEl.classList.add('invalid'); eEl.closest('.field')?.classList.add('error-state'); showToast('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น'); return; } modal.style.display = 'none'; exportCSVRange(s, e); showToast('กำลังดาวน์โหลดไฟล์ CSV'); });['exportStart', 'exportEnd'].forEach(id => { const el = document.getElementById(id); el.addEventListener('input', () => { el.classList.remove('invalid'); el.closest('.field')?.classList.remove('error-state'); }); }); const chips = ['rangeAll', 'rangeToday', 'range7', 'range30'].map(id => document.getElementById(id)); function setActive(btn) { chips.forEach(c => c && c.setAttribute('aria-pressed', 'false')); if (btn) btn.setAttribute('aria-pressed', 'true'); } const rangeAllBtn = document.getElementById('rangeAll'); if (rangeAllBtn) { rangeAllBtn.addEventListener('click', () => { setActive(rangeAllBtn); startDateFilter.value = ''; endDateFilter.value = ''; refresh(); showToast('เลือกช่วง: ทุกวัน (ทั้งหมด)'); }); } document.getElementById('rangeToday').addEventListener('click', () => { setActive(document.getElementById('rangeToday')); const today = dayjs().format('YYYY-MM-DD'); startDateFilter.value = today; endDateFilter.value = today; refresh(); showToast('เลือกช่วง: วันนี้'); }); document.getElementById('range7').addEventListener('click', () => { setActive(document.getElementById('range7')); startDateFilter.value = dayjs().subtract(6, 'day').format('YYYY-MM-DD'); endDateFilter.value = dayjs().format('YYYY-MM-DD'); refresh(); showToast('เลือกช่วง: 7 วันล่าสุด'); }); document.getElementById('range30').addEventListener('click', () => { setActive(document.getElementById('range30')); startDateFilter.value = dayjs().subtract(29, 'day').format('YYYY-MM-DD'); endDateFilter.value = dayjs().format('YYYY-MM-DD'); refresh(); showToast('เลือกช่วง: 30 วันล่าสุด'); }); ddDevice.addEventListener('change', () => { refresh(); const txt = ddDevice.value ? `Device: ${ddDevice.value}` : 'Device: ทั้งหมด'; showToast(txt); }); ddPoints.addEventListener('change', () => { refresh(); showToast(`กราฟล่าสุด ${ddPoints.value} จุด`); }); startDateFilter.addEventListener('change', () => { if (endDateFilter.value && startDateFilter.value > endDateFilter.value) endDateFilter.value = startDateFilter.value; refresh(); }); endDateFilter.addEventListener('change', () => { if (startDateFilter.value && startDateFilter.value > endDateFilter.value) endDateFilter.value = startDateFilter.value; refresh(); showToast(`ช่วงวันที่: ${formatDateRange()}`); }); document.querySelectorAll('.field[data-click-focus]').forEach(f => { f.addEventListener('click', e => { if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return; const ctrl = f.querySelector('select, input, button'); if (ctrl) { ctrl.focus({ preventScroll: true }); if (ctrl.tagName === 'INPUT' && (ctrl.type === 'date' || ctrl.type === 'datetime-local')) { if (typeof ctrl.showPicker === 'function') { try { ctrl.showPicker(); } catch { } } else { ctrl.click(); } } } }); }); if (rangeAllBtn) { setActive(rangeAllBtn); }
  // Hamburger toggle for mobile
  const hamburger = document.getElementById('menuToggle');
  const quickTools = document.getElementById('quickTools');
  if (hamburger && quickTools) {
    function closeMenu() { document.body.classList.remove('show-tools'); hamburger.setAttribute('aria-expanded', 'false'); }
    hamburger.addEventListener('click', () => {
      const open = !document.body.classList.contains('show-tools');
      document.body.classList.toggle('show-tools', open);
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        // Focus first chip for accessibility
        const firstChip = quickTools.querySelector('.chip');
        if (firstChip) firstChip.focus();
      }
    });
    // Close menu when any chip inside quickTools is clicked
    quickTools.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip') || e.target.closest('.chip')) {
        // Small delay to let the action complete before closing
        setTimeout(() => closeMenu(), 100);
      }
    });
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!quickTools.contains(e.target) && e.target !== hamburger && !hamburger.contains(e.target)) {
        if (document.body.classList.contains('show-tools')) closeMenu();
      }
    });
    // ESC to close
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('show-tools')) closeMenu(); });
  }
  await refresh(); 
  
  // Start realtime listeners or fallback to polling
  setupRealtimeListeners();
});

    // Return default "no data" cards for all parameters

