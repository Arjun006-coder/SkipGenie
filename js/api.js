/**
 * api.js — CyberVidya API Client
 * All requests to https://kiet.cybervidya.net/api
 * Token stored in localStorage as 'authToken'
 */

const API_BASE = 'https://kiet.cybervidya.net/api';

// ── Auth ─────────────────────────────────────────────────────
export function getToken() {
  return localStorage.getItem('authToken');
}

export function isLoggedIn() {
  const token = getToken();
  const ts = localStorage.getItem('authTokenTimestamp');
  if (!token || !ts) return false;
  const days = (Date.now() - parseInt(ts)) / (1000 * 60 * 60 * 24);
  return days <= 30;
}

export function doLogout() {
  ['authToken', 'authTokenTimestamp', 'studentId', 'cachedProfile', 'cachedCourses', 'cachedDashboard']
    .forEach(k => localStorage.removeItem(k));
}

// ── Core fetch with auth ──────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  let url = API_BASE + path;

  // Use a CORS proxy for public deployments (like GitHub Pages)
  // as kiet.cybervidya.net doesn't have CORS headers for random domains.
  if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    url = 'https://corsproxy.io/?' + encodeURIComponent(url);
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': token || '',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new AuthError('Session expired. Please login again.');
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

async function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

class AuthError extends Error {
  constructor(msg) { super(msg); this.isAuthError = true; }
}
export { AuthError };

// ── Helper ───────────────────────────────────────────────────
function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── API calls ────────────────────────────────────────────────

export async function getDashboardAttendance() {
  return apiFetch('/student/dashboard/attendance');
}

export async function getRegisteredCourses() {
  return apiFetch('/student/dashboard/registered-courses');
}

export async function getAttendanceAndDetails() {
  return apiFetch('/attendance/course/component/student');
}

export async function getStudentProfileInfo() {
  return apiFetch('/info/student/fetch');
}

export async function getWeeklySchedule(startDate, endDate) {
  const start = startDate || fmtDate(new Date());
  const end = endDate || fmtDate(new Date(Date.now() + 6 * 86400000));
  return apiFetch(`/student/schedule/class?weekStartDate=${start}&weekEndDate=${end}`);
}

export async function getLectureWiseAttendance(studentId, courseId, courseCompId) {
  const data = await apiPost('/attendance/schedule/student/course/attendance/percentage', {
    studentId, courseId, courseCompId
  });
  // Returns array — first element has lectureList
  if (Array.isArray(data) && data[0]) return data[0];
  return { presentCount: 0, lectureCount: 0, percent: 0, lectureList: [] };
}

export async function getExamSchedule() {
  return apiFetch('/exam/schedule/student/exams');
}

export async function getExamScore() {
  return apiFetch('/exam/score/get/score');
}

export async function getExamSessions(studentId) {
  return apiFetch(`/exam/form/session/config/getById/student/${studentId}`);
}

export async function getProfilePhoto(photoUrl) {
  // Fetches the photo as base64
  const token = getToken();
  try {
    let url = photoUrl;
    if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      url = 'https://corsproxy.io/?' + encodeURIComponent(url);
    }
    const res = await fetch(url, { headers: { Authorization: token } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}
