/**
 * app.js — Main application logic for SkipGenie
 * Handles navigation, data fetching, rendering all views,
 * attendance math, and the projection engine.
 */

import {
    isLoggedIn, doLogout, getToken,
    getDashboardAttendance, getRegisteredCourses,
    getAttendanceAndDetails, getStudentProfileInfo,
    getWeeklySchedule, getLectureWiseAttendance,
    getExamSchedule, getExamScore, getProfilePhoto,
    AuthError
} from './api.js';

// ─── Auth Guard ───────────────────────────────────────────────
if (!isLoggedIn()) { window.location.href = 'index.html'; }

// ─── State ───────────────────────────────────────────────────
let state = {
    userDetails: null,
    dashboard: null,
    courses: [],
    profilePhoto: null,
    ttWeekOffset: 0,
    examSchedule: null,
    examScores: null,
    ttSchedule: null,
    lectureCache: {},   // key: `${courseId}_${courseCompId}`
    theme: localStorage.getItem('theme') || 'dark',
};

// Apply saved theme
document.body.classList.toggle('light', state.theme === 'light');
updateThemeIcon();

// ─── Navigation ───────────────────────────────────────────────
const PAGE_LOADERS = {
    home: loadHome,
    timetable: loadTimetable,
    exams: loadExams,
    projection: loadProjection,
    profile: loadProfile,
};
let activePage = 'home';
let pagesLoaded = new Set();

window.navigate = function (page) {
    if (activePage === page) { closeSidebar(); return; }
    activePage = page;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

    closeSidebar();

    if (!pagesLoaded.has(page)) {
        pagesLoaded.add(page);
        PAGE_LOADERS[page]?.();
    }
};

// ─── Sidebar (mobile) ─────────────────────────────────────────
window.toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('mobOverlay').classList.toggle('open');
};
window.closeSidebar = () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('mobOverlay').classList.remove('open');
};

// ─── Theme ────────────────────────────────────────────────────
window.toggleTheme = function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('light', state.theme === 'light');
    localStorage.setItem('theme', state.theme);
    updateThemeIcon();
};
function updateThemeIcon() {
    const el = document.getElementById('themeIcon');
    if (el) el.textContent = state.theme === 'dark' ? '☀️' : '🌙';
}

// ─── Logout ───────────────────────────────────────────────────
window.confirmLogout = function () {
    if (confirm('Logout from SkipGenie?')) {
        doLogout();
        window.location.href = 'index.html';
    }
};

// ─── Toast ───────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
    const tw = document.getElementById('toastWrap');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    tw.appendChild(t);
    setTimeout(() => {
        t.classList.add('out');
        setTimeout(() => t.remove(), 350);
    }, duration);
}
window.toast = toast;

// ─── Greeting ────────────────────────────────────────────────
function getGreeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Good Morning';
    if (h >= 12 && h < 17) return 'Good Afternoon';
    if (h >= 17 && h < 20) return 'Good Evening';
    return 'Good Night';
}

// ─── Attendance Math ─────────────────────────────────────────
function attendanceInfo(present, total) {
    if (total === 0) return { pct: 0, status: 'safe', canMiss: 0, mustAttend: 0 };
    const pct = (present / total) * 100;
    let status = 'safe';
    if (pct < 75 && pct >= 65) status = 'warn';
    else if (pct < 65) status = 'danger';

    const canMiss = pct >= 75 ? Math.floor(present / 0.75 - total) : 0;
    const mustAttend = pct < 75 ? Math.ceil(3 * total - 4 * present) : 0;
    return { pct, status, canMiss, mustAttend };
}

function pctColor(status) {
    return status === 'safe' ? '#10b981' : status === 'warn' ? '#f59e0b' : '#ef4444';
}

// ─── Circular Progress SVG ────────────────────────────────────
function circularProgress(pct, size = 140, strokeW = 10) {
    const r = (size - strokeW) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - Math.min(pct, 100) / 100);
    const color = pct >= 75 ? '#10b981' : pct >= 65 ? '#f59e0b' : '#ef4444';
    const cx = size / 2, cy = size / 2;
    return `
    <svg class="circ-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="circ-bg" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${strokeW}" transform="rotate(-90 ${cx} ${cy})"/>
      <circle class="circ-track" cx="${cx}" cy="${cy}" r="${r}" stroke="${color}"
        stroke-width="${strokeW}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)"/>
    </svg>`;
}

// ─── HOME ─────────────────────────────────────────────────────
async function loadHome() {
    // Set greeting
    document.getElementById('homeGreeting').textContent =
        `${getGreeting()}, ${state.userDetails?.fullName?.split(' ')[0] || ''}! 👋`;

    try {
        const [details, dashboard, courses] = await Promise.all([
            state.userDetails ? Promise.resolve(state.userDetails) : getAttendanceAndDetails(),
            state.dashboard ? Promise.resolve(state.dashboard) : getDashboardAttendance(),
            state.courses.length ? Promise.resolve(state.courses) : getRegisteredCourses(),
        ]);

        state.userDetails = details;
        state.dashboard = dashboard;
        state.courses = courses;

        // Sidebar user info
        document.getElementById('sidebarName').textContent = details.fullName || '—';
        document.getElementById('sidebarRoll').textContent = details.rollNumber || '—';
        document.getElementById('homeGreeting').textContent =
            `${getGreeting()}, ${details.fullName?.split(' ')[0]}! 👋`;

        renderInfoStrip(details);
        renderOverallCard(dashboard);
        renderStatsRow(courses);
        renderCourseCards(courses);

        // Load profile photo async (non-blocking)
        loadProfilePhotoSidebar();

        // Load today statuses async
        loadTodayStatuses(courses);

        // Populate projection subject dropdown
        populateProjectionSubjects(courses);

    } catch (err) {
        if (err.isAuthError) { redirectLogin(); return; }
        document.getElementById('coursesGrid').innerHTML =
            `<div class="empty-state"><div class="empty-icon">❌</div><h3>Failed to load</h3><p>${err.message}</p></div>`;
        toast(err.message, 'error');
    }
}

function renderInfoStrip(d) {
    document.getElementById('infoStrip').innerHTML = `
    <div class="info-chip"><span class="ic-lbl">Roll</span>&nbsp;<span class="ic-val">${d.rollNumber?.trim()}</span></div>
    <div class="info-chip"><span class="ic-lbl">Branch</span>&nbsp;<span class="ic-val">${d.branchShortName}</span></div>
    <div class="info-chip"><span class="ic-lbl">Semester</span>&nbsp;<span class="ic-val">${d.semesterName}</span></div>
    <div class="info-chip"><span class="ic-lbl">Batch</span>&nbsp;<span class="ic-val">${d.admissionBatchName}</span></div>
  `;
}

function renderOverallCard(dashboard) {
    const pct = parseFloat((dashboard.presentPerc || 0).toFixed(1));
    const color = pct >= 75 ? '#10b981' : pct >= 65 ? '#f59e0b' : '#ef4444';
    const statusLabel = pct >= 75 ? '✅ Attendance is Safe' : pct >= 65 ? '⚠️ Getting Risky' : '🚨 Danger Zone';
    document.getElementById('overallCard').innerHTML = `
    <div class="circ-container">
      ${circularProgress(pct)}
      <div class="circ-center">
        <div class="circ-pct" style="color:${color}">${pct}%</div>
        <div class="circ-lbl">Overall</div>
      </div>
    </div>
    <div class="overall-info">
      <h3>${statusLabel}</h3>
      <p>Your overall attendance across all registered subjects is <strong style="color:${color}">${pct}%</strong>. The minimum requirement is <strong>75%</strong>.</p>
      <div class="attend-rule">🎓 Minimum required: 75% per subject</div>
    </div>
  `;
}

function renderStatsRow(courses) {
    let totalPresent = 0, totalLectures = 0, dangerCount = 0;
    courses.forEach(c => {
        const d = c.studentCourseCompDetails?.[0];
        if (d) {
            totalPresent += d.presentLecture || 0;
            totalLectures += d.totalLecture || 0;
            const { status } = attendanceInfo(d.presentLecture, d.totalLecture);
            if (status !== 'safe') dangerCount++;
        }
    });

    const { canMiss, mustAttend } = attendanceInfo(totalPresent, totalLectures);
    document.getElementById('statCanBunk').textContent = canMiss;
    document.getElementById('statMustAttend').textContent = mustAttend;
    document.getElementById('statSubjects').textContent = courses.length;
    document.getElementById('statDanger').textContent = dangerCount;
    document.getElementById('statsRow').style.display = '';
    document.getElementById('subjectHeading').textContent = '📚 Subject-wise Breakdown';
}

function renderCourseCards(courses, todayMap = {}) {
    if (!courses.length) {
        document.getElementById('coursesGrid').innerHTML =
            `<div class="empty-state"><div class="empty-icon">📭</div><h3>No courses found</h3><p>Pull to refresh or check your CyberVidya portal.</p></div>`;
        return;
    }

    document.getElementById('coursesGrid').innerHTML = courses.map(c => {
        const d = c.studentCourseCompDetails?.[0];
        if (!d) return '';
        const present = d.presentLecture || 0;
        const total = d.totalLecture || 0;
        const { pct, status, canMiss, mustAttend } = attendanceInfo(present, total);
        const pctDisplay = pct.toFixed(1);
        const color = pctColor(status);

        const todayStatus = todayMap[c.courseId];
        const badge = todayStatus ? badgeHTML(todayStatus) : '';

        let tipIcon, tipText;
        if (status === 'safe') {
            tipIcon = '🛡️';
            tipText = canMiss > 0
                ? `You can miss <strong>${canMiss} more</strong> classes and still stay above 75%.`
                : 'Don\'t miss any classes to stay above 75%.';
        } else {
            tipIcon = status === 'warn' ? '⚠️' : '🚨';
            tipText = `Attend next <strong>${mustAttend} classes</strong> consecutively to reach 75%.`;
        }

        return `
      <div class="course-card ${status}" onclick="openLectureModal('${c.courseName}',${c.studentId},${c.courseId},${d.courseCompId})">
        <div class="course-card-top-bar"></div>
        <div class="course-head">
          <div class="course-name">${c.courseName}</div>
          <div class="course-pct ${status}">${pctDisplay}%</div>
        </div>
        <div class="course-meta-row">
          <span class="attended-txt">${present} / ${total} attended</span>
          ${badge}
        </div>
        <div class="prog-bar-bg">
          <div class="prog-bar" style="width:${Math.min(pct, 100)}%;background:${color}"></div>
        </div>
        <div class="smart-tip ${status}">
          <span class="tip-icon">${tipIcon}</span>
          <span class="tip-text">${tipText}</span>
        </div>
        <div class="course-footer">
          <span>View Lectures</span>
          <span>→</span>
        </div>
      </div>`;
    }).join('');
}

function badgeHTML(status) {
    const map = {
        PRESENT: ['present', '✅', 'Present Today'],
        ABSENT: ['absent', '❌', 'Absent Today'],
        PENDING: ['pending', '⏳', 'Not Marked Yet'],
        SCHEDULED: ['scheduled', '📆', 'Upcoming'],
    };
    const [cls, ico, lbl] = map[status] || [];
    if (!cls) return '';
    return `<span class="badge ${cls}">${ico} ${lbl}</span>`;
}

// Today status loading
async function loadTodayStatuses(courses) {
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6) return; // Weekend

    try {
        const schedule = await getWeeklySchedule();
        state.ttSchedule = schedule;

        const todayClasses = schedule.filter(s => s.type !== 'HOLIDAY' && isSameDay(parseFlexDate(s.start), today));
        if (!todayClasses.length) return;

        const statusMap = {};
        await Promise.all(courses.map(async course => {
            const sched = todayClasses.find(s => s.courseCode?.trim() === course.courseCode?.trim());
            if (!sched) return;

            const endTime = parseFlexDate(sched.end);
            if (endTime && endTime > today) {
                statusMap[course.courseId] = 'SCHEDULED';
                return;
            }

            for (const comp of (course.studentCourseCompDetails || [])) {
                try {
                    const data = await getLectureWiseAttendance(course.studentId, course.courseId, comp.courseCompId);
                    const todayLec = data.lectureList?.find(l => isSameDay(parseFlexDate(l.planLecDate), today));
                    if (todayLec && (todayLec.attendance === 'PRESENT' || todayLec.attendance === 'ABSENT')) {
                        statusMap[course.courseId] = todayLec.attendance;
                        return;
                    }
                } catch { }
            }
            statusMap[course.courseId] = 'PENDING';
        }));

        renderCourseCards(courses, statusMap);
    } catch { }
}

// ─── LECTURE MODAL ────────────────────────────────────────────
window.openLectureModal = async function (courseName, studentId, courseId, courseCompId) {
    document.getElementById('lectureModalTitle').textContent = courseName;
    document.getElementById('lectureModalBody').innerHTML =
        `<div class="loading-wave"><span></span><span></span><span></span><span></span><span></span></div>`;
    document.getElementById('lectureModal').classList.add('open');

    const key = `${courseId}_${courseCompId}`;
    try {
        const data = state.lectureCache[key] || await getLectureWiseAttendance(studentId, courseId, courseCompId);
        state.lectureCache[key] = data;

        const { presentCount, lectureCount, percent, lectureList } = data;
        const { canMiss, mustAttend } = attendanceInfo(presentCount, lectureCount);

        document.getElementById('lectureModalBody').innerHTML = `
      <div class="lec-stats">
        <div class="lec-stat present-stat">
          <div class="ls-val" style="color:#10b981">${presentCount}</div>
          <div class="ls-lbl">Present</div>
        </div>
        <div class="lec-stat absent-stat">
          <div class="ls-val" style="color:#ef4444">${lectureCount - presentCount}</div>
          <div class="ls-lbl">Absent</div>
        </div>
        <div class="lec-stat total-stat">
          <div class="ls-val" style="color:var(--c-primary-l)">${lectureCount}</div>
          <div class="ls-lbl">Total</div>
        </div>
      </div>
      ${canMiss > 0
                ? `<div style="padding:10px 14px;border-radius:8px;background:var(--c-success-bg);border:1px solid rgba(16,185,129,0.2);color:#10b981;font-size:13px;font-weight:600;margin-bottom:16px;">🛡️ You can miss <strong>${canMiss}</strong> more classes.</div>`
                : mustAttend > 0
                    ? `<div style="padding:10px 14px;border-radius:8px;background:var(--c-danger-bg);border:1px solid rgba(239,68,68,0.25);color:#ef4444;font-size:13px;font-weight:600;margin-bottom:16px;">🚨 Attend next <strong>${mustAttend}</strong> classes to reach 75%.</div>`
                    : `<div style="padding:10px 14px;border-radius:8px;background:var(--c-warning-bg);border:1px solid rgba(245,158,11,0.2);color:#f59e0b;font-size:13px;font-weight:600;margin-bottom:16px;">⚠️ Don't skip any more classes!</div>`
            }
      <div class="lec-list">
        ${(lectureList || []).slice().reverse().map(l => {
                const isP = l.attendance === 'PRESENT';
                return `
            <div class="lec-row">
              <div class="lec-dot ${isP ? 'present' : 'absent'}"></div>
              <div class="lec-date">${formatDisplayDate(l.planLecDate)}</div>
              <div class="lec-slot">${l.timeSlot || ''}</div>
              <div class="lec-status ${isP ? 'present' : 'absent'}">${isP ? '✅ Present' : '❌ Absent'}</div>
            </div>`;
            }).join('')}
      </div>
    `;
    } catch (e) {
        document.getElementById('lectureModalBody').innerHTML =
            `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
    }
};

window.closeLectureModal = function (e) {
    if (!e || e.target === document.getElementById('lectureModal')) {
        document.getElementById('lectureModal').classList.remove('open');
    }
};

// ─── REFRESH ──────────────────────────────────────────────────
window.refreshHome = async function () {
    state.userDetails = null;
    state.dashboard = null;
    state.courses = [];
    state.lectureCache = {};
    pagesLoaded.delete('home');
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    await loadHome();
    btn.classList.remove('spinning');
    toast('Data refreshed!', 'success');
};

// ─── TIMETABLE ───────────────────────────────────────────────
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function loadTimetable() {
    state.ttWeekOffset = 0;
    await renderTimetable();
}

window.changeWeek = async function (dir) {
    if (dir === 0) state.ttWeekOffset = 0;
    else state.ttWeekOffset += dir;
    await renderTimetable();
};

async function renderTimetable() {
    document.getElementById('ttContent').innerHTML =
        `<div class="loading-wave"><span></span><span></span><span></span><span></span><span></span></div>`;

    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + state.ttWeekOffset * 7);

    // Week start = Monday
    const dayOfWeek = baseDate.getDay() || 7;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - dayOfWeek + 1);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmtRange = d => `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
    document.getElementById('ttWeekRange').textContent =
        `${fmtRange(monday)} – ${fmtRange(sunday)}, ${sunday.getFullYear()}`;

    try {
        const schedule = await getWeeklySchedule(fmtDate(monday), fmtDate(sunday));
        const today = new Date();

        // Group by day of week (Mon–Sun)
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            days.push({ date: d, events: [] });
        }

        schedule.forEach(ev => {
            const evDate = parseFlexDate(ev.start);
            if (!evDate) return;
            const slot = days.find(d => isSameDay(d.date, evDate));
            if (slot) slot.events.push(ev);
        });

        // Sort each day's events by time
        days.forEach(d => d.events.sort((a, b) => (parseFlexDate(a.start) || 0) - (parseFlexDate(b.start) || 0)));

        const todayStr = today.toDateString();

        document.getElementById('ttContent').innerHTML = days.map(d => {
            const isToday = d.date.toDateString() === todayStr;
            const dayName = DAYS[d.date.getDay()];
            const dateStr = `${d.date.getDate()} ${d.date.toLocaleString('default', { month: 'short' })}`;

            const eventsHTML = d.events.length === 0
                ? `<div class="tt-empty">No classes</div>`
                : d.events.map(ev => {
                    if (ev.type === 'HOLIDAY') {
                        return `<div class="tt-holiday">🏖️ ${ev.title || 'Holiday'}</div>`;
                    }
                    const startT = fmtTime(parseFlexDate(ev.start));
                    const endT = fmtTime(parseFlexDate(ev.end));
                    return `
              <div class="tt-class">
                <div class="tt-time">${startT}${endT ? ` – ${endT}` : ''}</div>
                <div class="tt-info">
                  <div class="tt-name">${ev.courseName || ev.title || '—'}</div>
                  <div class="tt-room">${[ev.classRoom, ev.facultyName].filter(Boolean).join(' · ')}</div>
                </div>
                <div class="badge scheduled">📆</div>
              </div>`;
                }).join('');

            return `
        <div class="tt-day">
          <div class="tt-day-header">
            <span class="tt-day-name ${isToday ? 'today' : ''}">${dayName}</span>
            <span style="font-size:12px;color:var(--c-text-3)">${dateStr}</span>
            ${isToday ? '<span class="tt-today-chip">Today</span>' : ''}
          </div>
          ${eventsHTML}
        </div>`;
        }).join('');

    } catch (e) {
        document.getElementById('ttContent').innerHTML =
            `<div class="empty-state"><div class="empty-icon">📅</div><h3>Could not load schedule</h3><p>${e.message}</p></div>`;
    }
}

// ─── EXAMS ────────────────────────────────────────────────────
let examScoresLoaded = false;

async function loadExams() {
    loadExamSchedule();
}

window.switchExamTab = function (tab, el) {
    document.querySelectorAll('.exam-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('examSchedulePanel').style.display = tab === 'schedule' ? '' : 'none';
    document.getElementById('examScoresPanel').style.display = tab === 'scores' ? '' : 'none';
    if (tab === 'scores' && !examScoresLoaded) loadExamScores();
};

async function loadExamSchedule() {
    try {
        const schedule = await getExamSchedule();
        if (!schedule.length) {
            document.getElementById('examSchedulePanel').innerHTML =
                `<div class="empty-state"><div class="empty-icon">📝</div><h3>No exam schedule</h3><p>Check back closer to exam time.</p></div>`;
            return;
        }
        // Group by date
        const grouped = {};
        schedule.forEach(ex => {
            const key = ex.strExamDate || 'Unknown Date';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(ex);
        });

        document.getElementById('examSchedulePanel').innerHTML = Object.entries(grouped).map(([date, exams]) => `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;font-weight:800;color:var(--c-text-3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--c-border);">📅 ${date}</div>
        ${exams.map(ex => `
          <div class="exam-item">
            <div class="exam-course">${ex.courseName}</div>
            <div class="exam-chips">
              <span class="exam-chip"><span>🕐</span>${ex.strExamTime || '—'}</span>
              <span class="exam-chip"><span>📍</span>${ex.examVenueName || '—'}</span>
              <span class="exam-chip"><span>📋</span>${ex.evalLevelComponentName || '—'}</span>
              <span class="exam-chip"><span>💻</span>${ex.examMode || '—'}</span>
            </div>
          </div>`).join('')}
      </div>`).join('');
    } catch (e) {
        document.getElementById('examSchedulePanel').innerHTML =
            `<div class="empty-state"><div class="empty-icon">❌</div><h3>Failed to load</h3><p>${e.message}</p></div>`;
    }
}

async function loadExamScores() {
    examScoresLoaded = true;
    const panel = document.getElementById('examScoresPanel');
    try {
        const data = await getExamScore();
        if (!data) { panel.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><h3>No results yet</h3></div>`; return; }

        const { cgpa, fullName, studentSemesterWiseMarksDetailsList: sems } = data;
        panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px;padding:20px 22px;background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--radius);">
        <div>
          <div style="font-size:12px;color:var(--c-text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.07em;">Overall CGPA</div>
          <div style="font-size:42px;font-weight:900;background:var(--grad-primary);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${cgpa || '—'}</div>
        </div>
        <div style="font-size:14px;color:var(--c-text-2);">${fullName}</div>
      </div>
      ${(sems || []).map(sem => `
        <div class="score-sem card" style="margin-bottom:16px;">
          <div class="sem-header">
            <div class="sem-name">${sem.semesterName}</div>
            <div class="sem-sgpa">SGPA: ${sem.sgpa || '—'}</div>
          </div>
          <table class="grade-table">
            <thead><tr><th>Subject</th><th>Grade</th><th>Credits</th><th>Result</th></tr></thead>
            <tbody>
              ${(sem.studentMarksDetailsDTO || []).map(sub => {
            const comp = sub.courseCompDTOList?.[0];
            const mark = comp?.compSessionLevelMarks?.[0];
            return `
                  <tr>
                    <td>${sub.courseName}</td>
                    <td style="font-weight:800;color:var(--c-primary-l)">${mark?.grade || '—'}</td>
                    <td>${mark?.compCredits || '—'}</td>
                    <td><span class="grade-pill ${sub.resultSort === 'PASS' ? 'pass' : 'fail'}">${sub.resultSort || '—'}</span></td>
                  </tr>`;
        }).join('')}
            </tbody>
          </table>
        </div>`).join('')}`;
    } catch (e) {
        panel.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>Failed to load scores</h3><p>${e.message}</p></div>`;
    }
}

// ─── PROFILE ─────────────────────────────────────────────────
async function loadProfile() {
    try {
        const [details, info] = await Promise.all([
            state.userDetails || getAttendanceAndDetails(),
            getStudentProfileInfo()
        ]);
        state.userDetails = details;

        // Try photo
        let photoHTML = `<div class="avatar-lg">${(details.fullName || '?')[0]}</div>`;
        if (info.profilePhoto && getToken()) {
            const b64 = state.profilePhoto || await getProfilePhoto(info.profilePhoto);
            if (b64) { state.profilePhoto = b64; photoHTML = `<div class="avatar-lg"><img src="${b64}" alt="Photo"/></div>`; }
        }

        document.getElementById('profileContent').innerHTML = `
      <div class="profile-hero">
        ${photoHTML}
        <div>
          <div class="profile-name">${details.fullName || '—'}</div>
          <div class="profile-reg">${info.registrationNumber || details.registrationNumber || '—'}</div>
          <div class="profile-branch">
            <span class="pbadge">${details.branchShortName}</span>
            <span class="pbadge">${details.semesterName}</span>
            <span class="pbadge">${details.degreeName}</span>
          </div>
        </div>
      </div>
      <div class="profile-info-grid">
        ${profileInfoRow('🎫', 'Roll Number', details.rollNumber)}
        ${profileInfoRow('📋', 'Registration No', info.registrationNumber || details.registrationNumber)}
        ${profileInfoRow('🏫', 'Branch', details.branchShortName)}
        ${profileInfoRow('📚', 'Semester', details.semesterName)}
        ${profileInfoRow('🎓', 'Degree', details.degreeName)}
        ${profileInfoRow('📆', 'Admission Batch', details.admissionBatchName)}
      </div>`;
    } catch (e) {
        document.getElementById('profileContent').innerHTML =
            `<div class="empty-state"><div class="empty-icon">❌</div><h3>Could not load profile</h3><p>${e.message}</p></div>`;
    }
}

function profileInfoRow(ico, label, val) {
    return `
    <div class="pinfo-card">
      <div class="pinfo-lbl">${ico} ${label}</div>
      <div class="pinfo-val">${val || '—'}</div>
    </div>`;
}

// ─── LOAD PROFILE PHOTO in SIDEBAR ───────────────────────────
async function loadProfilePhotoSidebar() {
    try {
        const info = await getStudentProfileInfo();
        if (info.profilePhoto) {
            const b64 = state.profilePhoto || await getProfilePhoto(info.profilePhoto);
            if (b64) {
                state.profilePhoto = b64;
                document.getElementById('sidebarAvatar').innerHTML = `<img src="${b64}" alt="" />`;
            }
        }
    } catch { }
}

// ─── PROJECTION ENGINE ────────────────────────────────────────
let exclusions = []; // [{date: 'YYYY-MM-DD', courseId: null|number, courseName: ''}]

function loadProjection() {
    // Set default date to 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    document.getElementById('projDate').value = fmtDate(d);

    // Set default exclusion date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('exclDate').value = fmtDate(tomorrow);

    populateProjectionSubjects(state.courses);
}

function populateProjectionSubjects(courses) {
    const sel = document.getElementById('exclSubject');
    if (!sel) return;
    sel.innerHTML = `<option value="">— Full Day Leave —</option>`;
    courses.forEach(c => {
        sel.innerHTML += `<option value="${c.courseId}">${c.courseName}</option>`;
    });
}

window.addExclusion = function () {
    const date = document.getElementById('exclDate').value;
    const sel = document.getElementById('exclSubject');
    const courseId = sel.value ? parseInt(sel.value) : null;
    const courseName = sel.value ? sel.options[sel.selectedIndex].text : 'Full Day';

    if (!date) { toast('Please pick a date', 'error'); return; }
    if (new Date(date) <= new Date(new Date().toDateString())) { toast('Exclusion date must be in the future', 'error'); return; }

    const exists = exclusions.find(e => e.date === date && e.courseId === courseId);
    if (exists) { toast('Already added!', 'info'); return; }

    exclusions.push({ date, courseId, courseName });
    renderExclusions();
};

function renderExclusions() {
    const list = document.getElementById('exclusionList');
    if (!exclusions.length) { list.innerHTML = ''; return; }
    list.innerHTML = exclusions.map((e, i) => `
    <div class="excl-tag">
      <div class="excl-tag-text">📅 ${e.date} — ${e.courseName}</div>
      <span class="excl-tag-remove" onclick="removeExclusion(${i})">✕</span>
    </div>`).join('');
}

window.removeExclusion = function (i) {
    exclusions.splice(i, 1);
    renderExclusions();
};

window.runProjection = function () {
    const courses = state.courses;
    if (!courses.length) { toast('Load your attendance first (go to Home tab)', 'error'); return; }

    const targetDate = document.getElementById('projDate').value;
    if (!targetDate) { toast('Please select a target date', 'error'); return; }

    const today = new Date(new Date().toDateString());
    const endDate = new Date(targetDate);
    if (endDate <= today) { toast('Target date must be in the future', 'error'); return; }

    const assume = document.getElementById('projAssume').value;

    // Count working days between today and target date (Mon-Fri)
    let workdays = 0;
    const d = new Date(today);
    d.setDate(d.getDate() + 1); // Start from tomorrow
    while (d <= endDate) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) workdays++;
        d.setDate(d.getDate() + 1);
    }

    // Build exclusion index
    const exclFull = new Set(exclusions.filter(e => !e.courseId).map(e => e.date));
    const exclCourse = {}; // courseId -> Set of dates
    exclusions.filter(e => e.courseId).forEach(e => {
        if (!exclCourse[e.courseId]) exclCourse[e.courseId] = new Set();
        exclCourse[e.courseId].add(e.date);
    });

    const results = courses.map(c => {
        const comp = c.studentCourseCompDetails?.[0];
        if (!comp) return null;
        const curPresent = comp.presentLecture || 0;
        const curTotal = comp.totalLecture || 0;
        const { pct: curPct } = attendanceInfo(curPresent, curTotal);

        if (assume === 'none') {
            return { course: c, curPresent, curTotal, curPct, projPresent: curPresent, projTotal: curTotal };
        }

        // Estimate new lectures per working day per course
        // We use 1 lecture per working day as a reasonable default
        const courseExclDates = exclCourse[c.courseId] || new Set();

        let addPresent = 0;
        let addTotal = 0;

        const iter = new Date(today);
        iter.setDate(iter.getDate() + 1);
        while (iter <= endDate) {
            const dow = iter.getDay();
            if (dow !== 0 && dow !== 6) {
                const ds = fmtDate(iter);
                addTotal++;
                const skipped = exclFull.has(ds) || courseExclDates.has(ds);
                if (!skipped) addPresent++;
            }
            iter.setDate(iter.getDate() + 1);
        }

        const projPresent = curPresent + addPresent;
        const projTotal = curTotal + addTotal;
        return { course: c, curPresent, curTotal, curPct, projPresent, projTotal };
    }).filter(Boolean);

    renderProjectionResults(results, targetDate, workdays);
};

function renderProjectionResults(results, targetDate, workdays) {
    document.getElementById('projPlaceholder').style.display = 'none';
    const wrap = document.getElementById('projResultsWrap');
    wrap.style.display = '';

    let dangerItems = [];

    const rows = results.map(r => {
        const { pct: projPct, status: projStatus, canMiss: pCanMiss, mustAttend: pMust } = attendanceInfo(r.projPresent, r.projTotal);
        const curDisp = r.curPct.toFixed(1);
        const projDisp = projPct.toFixed(1);
        const delta = projPct - r.curPct;
        const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
        const deltaClass = delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : 'same';

        if (projStatus !== 'safe') dangerItems.push({ name: r.course.courseName, pct: projDisp, must: pMust });

        return `
      <div class="proj-course-row">
        <div class="proj-name">${r.course.courseName}</div>
        <div class="proj-from">${curDisp}%</div>
        <div class="proj-arrow">→</div>
        <div class="proj-to ${projStatus}">${projDisp}%</div>
        <div class="proj-delta ${deltaClass}">${deltaStr}</div>
      </div>`;
    }).join('');

    const dangerBanner = dangerItems.length
        ? `<div class="proj-danger-banner">
        🚨 <strong>${dangerItems.length} subject(s)</strong> will be below 75%:<br/>
        ${dangerItems.map(d => `• ${d.name} → ${d.pct}% (attend ${d.must} more)`).join('<br/>')}
      </div>`
        : `<div style="padding:12px 16px;border-radius:8px;background:var(--c-success-bg);border:1px solid rgba(16,185,129,0.2);color:#10b981;font-size:13px;font-weight:600;margin-top:12px;">✅ All subjects will be above 75% on ${targetDate}!</div>`;

    wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
      <h3 class="proj-results-title">📊 Projection for ${targetDate}</h3>
      <div style="font-size:12px;color:var(--c-text-3);">${workdays} working days ahead</div>
    </div>
    <div style="display:flex;gap:10px;font-size:12px;color:var(--c-text-3);margin-bottom:12px;padding:8px 16px;background:rgba(255,255,255,0.03);border-radius:8px;">
      <span>Subject</span><span style="margin-left:auto;">Now</span><span>→</span><span>Projected</span><span>Δ</span>
    </div>
    ${rows}
    ${dangerBanner}`;
}

// ─── Helpers ──────────────────────────────────────────────────
function parseFlexDate(str) {
    if (!str) return null;
    try {
        // "DD/MM/YYYY HH:mm" or "DD-MM-YYYY" or "YYYY-MM-DD"
        if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(str)) {
            const [datePart, timePart] = str.split(' ');
            const [d, m, y] = datePart.split(/[\/\-]/).map(Number);
            const dt = new Date(y, m - 1, d);
            if (timePart) { const [h, mn] = timePart.split(':').map(Number); dt.setHours(h, mn); }
            return dt;
        }
        return new Date(str);
    } catch { return null; }
}

function isSameDay(a, b) {
    if (!a || !b) return false;
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(d) {
    if (!d) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDisplayDate(str) {
    const d = parseFlexDate(str);
    if (!d) return str;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function redirectLogin() {
    doLogout();
    window.location.href = 'index.html';
}

// ─── BOOT ─────────────────────────────────────────────────────
loadHome();
pagesLoaded.add('home');
