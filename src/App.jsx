import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import * as XLSX from "xlsx";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const BASE_URL = import.meta.env.BASE_URL || "/";
const DATA_XLSX = `${BASE_URL}data/pregnancy-data.xlsx`;
const DATA_JSON = `${BASE_URL}data/pregnancy-data.json`;
const STORAGE_KEY = "pregnancy-planner-settings";
const startDate = "2025-10-20";

const defaultSettings = {
  owner: "",
  repo: "",
  branch: "main",
  token: "",
  jsonPath: "public/data/pregnancy-data.json",
  xlsxPath: "public/data/pregnancy-data.xlsx",
};

const emptyForm = {
  date: "",
  type: "",
  title: "",
  notes: "",
};

const medicalSummary = [
  {
    date: "05 Dec 2025",
    title: "First Ultrasound",
    points: [
      "Early pregnancy confirmation",
      "Heartbeat present (134 bpm)",
      "GA around 7 weeks",
    ],
  },
  {
    date: "08 Jan 2026",
    title: "Ultrasound 1 – Dating",
    points: ["Growth consistent with LMP", "GA progressing normally"],
  },
  {
    date: "09 Mar 2026",
    title: "Ultrasound 2 – NT Scan",
    points: [
      "CRL: ~5.6 cm",
      "GA: ~12–13 weeks",
      "Fetal HR: 159 bpm (Normal range 120–170)",
      "NT: 1.10 mm (Normal range)",
      "Everything appears within normal limits",
    ],
  },
  {
    date: "2026 Timeline",
    title: "Upcoming milestones",
    points: [
      "Current EDD: 13 July 2026",
      "End of 1st Trimester: Early Jan 2026",
      "Anatomy Scan (Level 2): Around April 2026",
      "Glucose Test: May 2026",
      "Delivery Window: 38–40 weeks (late June to mid July 2026)",
    ],
  },
];

function formatDateInput(value) {
  if (!value) return "";
  if (value instanceof Date && isValid(value)) {
    return format(value, "yyyy-MM-dd");
  }
  const parsed = parseISO(String(value));
  if (isValid(parsed)) {
    return format(parsed, "yyyy-MM-dd");
  }
  return "";
}

function normalizeEvent(raw) {
  const dateValue = raw.date ?? raw.Date ?? raw.DATE;
  const date = formatDateInput(dateValue);
  return {
    date,
    type: String(raw.type ?? raw.Type ?? "").trim(),
    title: String(raw.title ?? raw.Title ?? "").trim(),
    notes: String(raw.notes ?? raw.Notes ?? "").trim(),
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function stringToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  return arrayBufferToBase64(bytes.buffer);
}

async function fetchSheetEvents() {
  const response = await fetch(DATA_XLSX);
  if (!response.ok) {
    throw new Error("Unable to load pregnancy-data.xlsx");
  }
  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  });
  return rows.map(normalizeEvent).filter((event) => event.date);
}

async function fetchJsonEvents() {
  const response = await fetch(DATA_JSON);
  if (!response.ok) {
    throw new Error("Unable to load pregnancy-data.json");
  }
  const data = await response.json();
  const rows = Array.isArray(data?.events) ? data.events : [];
  return rows.map(normalizeEvent).filter((event) => event.date);
}

async function getGitHubFileSha({ owner, repo, path, branch, token }) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to read ${path}: ${response.status}`);
  }

  const data = await response.json();
  return data.sha;
}

async function putGitHubFile({ owner, repo, path, branch, token, content, message }) {
  const sha = await getGitHubFileSha({ owner, repo, path, branch, token });

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message,
        content,
        sha,
        branch,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update ${path}: ${response.status} ${errorText}`);
  }

  return response.json();
}

function App() {
  const [events, setEvents] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    saving: false,
    message: "",
  });
  const [form, setForm] = useState(emptyForm);
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(saved) });
      } catch (error) {
        console.error("Unable to parse settings", error);
      }
    }
  }, []);

  useEffect(() => {
    async function loadEvents() {
      setStatus((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const sheetEvents = await fetchSheetEvents();
        setEvents(sheetEvents);
      } catch (error) {
        try {
          const jsonEvents = await fetchJsonEvents();
          setEvents(jsonEvents);
        } catch (jsonError) {
          setStatus((prev) => ({
            ...prev,
            error: jsonError.message || "Unable to load data",
          }));
        }
      } finally {
        setStatus((prev) => ({ ...prev, loading: false }));
      }
    }

    loadEvents();
  }, []);

  const eventsByDate = useMemo(() => {
    return events.reduce((acc, event) => {
      if (!event.date) return acc;
      if (!acc[event.date]) acc[event.date] = [];
      acc[event.date].push(event);
      return acc;
    }, {});
  }, [events]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDateOfWeek = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDateOfWeek = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = [];
    let day = startDateOfWeek;
    while (day <= endDateOfWeek) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const pregnancyProgress = useMemo(() => {
    const lmpDate = parseISO(startDate);
    const today = new Date();
    const dayDelta = differenceInCalendarDays(today, lmpDate);
    const weekNumber = dayDelta >= 0 ? Math.floor(dayDelta / 7) : 0;
    const dayOfWeek = dayDelta >= 0 ? dayDelta % 7 : 0;
    const weekStart = addDays(lmpDate, Math.max(0, weekNumber) * 7);
    const weekEnd = addDays(weekStart, 6);
    const trimester =
      weekNumber <= 0
        ? "-"
        : weekNumber <= 12
        ? "1st Trimester"
        : weekNumber <= 27
        ? "2nd Trimester"
        : "3rd Trimester";
    const pregnancyMonth = weekNumber <= 0 ? "-" : Math.ceil(weekNumber / 4);

    return {
      weekNumber,
      dayOfWeek,
      trimester,
      pregnancyMonth,
      range: `${format(weekStart, "MMM d, yyyy")} - ${format(weekEnd, "MMM d, yyyy")}`,
      weekStart,
      weekEnd,
      todayKey: format(today, "yyyy-MM-dd"),
    };
  }, []);

  const ultrasoundEvents = useMemo(() => {
    return events
      .filter((event) => event.type.toLowerCase().includes("ultrasound"))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 2);
  }, [events]);

  const selectedEvents = useMemo(() => {
    const key = format(selectedDate, "yyyy-MM-dd");
    return eventsByDate[key] || [];
  }, [selectedDate, eventsByDate]);

  const upcomingEvents = useMemo(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    return events
      .filter((event) => event.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [events]);

  const topEvents = useMemo(() => upcomingEvents.slice(0, 3), [upcomingEvents]);

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleAddEvent(event) {
    event.preventDefault();
    if (!form.date || !form.title) {
      setStatus((prev) => ({
        ...prev,
        message: "Please add at least a date and title.",
      }));
      return;
    }

    const newEvent = normalizeEvent(form);
    setEvents((prev) => [...prev, newEvent].sort((a, b) => a.date.localeCompare(b.date)));
    setSelectedDate(parseISO(newEvent.date));
    setForm(emptyForm);
    setStatus((prev) => ({ ...prev, message: "Event added locally." }));
  }

  function handleSettingsChange(event) {
    const { name, value } = event.target;
    const updated = { ...settings, [name]: value };
    setSettings(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  async function handleSync() {
    if (!settings.owner || !settings.repo || !settings.token) {
      setStatus((prev) => ({
        ...prev,
        message: "Add GitHub owner, repo, and token before syncing.",
      }));
      return;
    }

    setStatus((prev) => ({ ...prev, saving: true, message: "" }));

    try {
      const jsonBody = JSON.stringify({ events }, null, 2);
      const jsonContent = stringToBase64(jsonBody);

      const sheet = XLSX.utils.json_to_sheet(events);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Events");
      const xlsxBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const xlsxContent = arrayBufferToBase64(xlsxBuffer);

      await putGitHubFile({
        owner: settings.owner,
        repo: settings.repo,
        path: settings.jsonPath,
        branch: settings.branch,
        token: settings.token,
        content: jsonContent,
        message: "Update pregnancy data JSON",
      });

      await putGitHubFile({
        owner: settings.owner,
        repo: settings.repo,
        path: settings.xlsxPath,
        branch: settings.branch,
        token: settings.token,
        content: xlsxContent,
        message: "Update pregnancy data Excel",
      });

      setStatus((prev) => ({
        ...prev,
        message: "Synced data to GitHub.",
      }));
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        message: error.message || "Sync failed.",
      }));
    } finally {
      setStatus((prev) => ({ ...prev, saving: false }));
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Stack spacing={4}>
        <Box textAlign="center">
          <Typography variant="overline" sx={{ letterSpacing: "0.4em", color: "secondary.main" }}>
            Pregnancy Journey Planner
          </Typography>
          <Typography variant="h1" sx={{ fontSize: { xs: 36, md: 52 }, fontWeight: 600, mt: 1 }}>
            A calm, beautiful view of your weeks ahead
          </Typography>
          <Typography sx={{ maxWidth: 560, mx: "auto", mt: 2, color: "text.secondary" }}>
            Built around your LMP, your calendar keeps milestone scans, injections,
            and baby moments in a single, soothing space.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center" mt={3}>
            <Chip
              label={`LMP start: ${format(parseISO(startDate), "MMM d, yyyy")}`}
              sx={{ bgcolor: "white", border: "1px solid rgba(255,122,162,0.4)" }}
            />
            <Chip
              label={`Week ${pregnancyProgress.weekNumber}, Day ${pregnancyProgress.dayOfWeek} · ${pregnancyProgress.trimester}`}
              sx={{ bgcolor: "white", border: "1px solid rgba(95,157,255,0.4)" }}
            />
            <Chip
              label={`Pregnancy month: ${pregnancyProgress.pregnancyMonth}`}
              sx={{ bgcolor: "white", border: "1px solid rgba(126,140,255,0.4)" }}
            />
          </Stack>
        </Box>

        <Card
          sx={{
            bgcolor: "#0b1025",
            color: "white",
            borderRadius: 6,
            boxShadow: "0 26px 60px rgba(8,12,32,0.45)",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <IconButton
                onClick={() => setCurrentMonth((prev) => addMonths(prev, -1))}
                sx={{ color: "white", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Box textAlign="center">
                <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.3em" }}>
                  Month
                </Typography>
                <Typography variant="h3" sx={{ fontSize: { xs: 24, md: 32 } }}>
                  {format(currentMonth, "MMMM yyyy")}
                </Typography>
              </Box>
              <IconButton
                onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
                sx={{ color: "white", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <ChevronRightIcon />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" mt={3}>
              {topEvents.length === 0 ? (
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>
                  No upcoming events yet.
                </Typography>
              ) : (
                topEvents.map((eventItem) => (
                  <Button
                    key={`top-${eventItem.date}-${eventItem.title}`}
                    size="small"
                    onClick={() => setSelectedDate(parseISO(eventItem.date))}
                    sx={{
                      px: 2,
                      py: 1,
                      borderRadius: 999,
                      textTransform: "none",
                      color: "white",
                      background: "linear-gradient(90deg, rgba(95,157,255,0.9), rgba(255,122,162,0.9))",
                      boxShadow: "0 12px 24px rgba(15,23,42,0.35)",
                      "&:hover": {
                        background: "linear-gradient(90deg, rgba(95,157,255,1), rgba(255,122,162,1))",
                      },
                    }}
                  >
                    {format(parseISO(eventItem.date), "MMM d")}: {eventItem.title}
                  </Button>
                ))
              )}
            </Stack>

            <Box
              sx={{
                mt: 3,
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: 1,
                textAlign: "center",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </Box>

            <Box
              sx={{
                mt: 2,
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: 1,
              }}
            >
              {calendarDays.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const isOutside = !isSameMonth(day, currentMonth);
                const isSelected = isSameDay(day, selectedDate);
                const hasEvent = Boolean(eventsByDate[key]?.length);
                const isToday = key === pregnancyProgress.todayKey;
                const isCurrentWeek =
                  day >= pregnancyProgress.weekStart && day <= pregnancyProgress.weekEnd;
                const dayEvents = eventsByDate[key] || [];

                return (
                  <Box
                    key={key}
                    component="button"
                    onClick={() => setSelectedDate(day)}
                    sx={{
                      borderRadius: 3,
                      border: "1px solid",
                      borderColor: isOutside
                        ? "transparent"
                        : isCurrentWeek
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(255,255,255,0.08)",
                      backgroundColor: isOutside ? "transparent" : "rgba(255,255,255,0.04)",
                      color: isOutside ? "rgba(255,255,255,0.3)" : "white",
                      minHeight: { xs: 70, md: 86 },
                      px: 1,
                      py: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.5,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      ...(isSelected && {
                        borderColor: "rgba(95,157,255,0.9)",
                        backgroundColor: "rgba(95,157,255,0.2)",
                      }),
                      ...(isToday && {
                        borderColor: "rgba(255,122,162,0.9)",
                        backgroundColor: "rgba(255,122,162,0.2)",
                        boxShadow: "0 0 0 3px rgba(255,122,162,0.25)",
                      }),
                      "&:hover": {
                        borderColor: "rgba(255,255,255,0.35)",
                      },
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {format(day, "d")}
                    </Typography>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: hasEvent ? "secondary.main" : "transparent",
                      }}
                    />
                    {dayEvents.length > 0 ? (
                      <Typography
                        variant="caption"
                        sx={{
                          color: "rgba(255,255,255,0.7)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {dayEvents[0].title}
                      </Typography>
                    ) : null}
                  </Box>
                );
              })}
            </Box>

            <Box mt={3} p={2} sx={{ bgcolor: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
              <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.3em" }}>
                Selected Day
              </Typography>
              <Typography variant="h4" sx={{ mt: 0.5, fontSize: 22 }}>
                {format(selectedDate, "MMMM d")}
              </Typography>
              {selectedEvents.length === 0 ? (
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.6)", mt: 1 }}>
                  No events for this day yet.
                </Typography>
              ) : (
                <Stack spacing={1.5} mt={2}>
                  {selectedEvents.map((eventItem, index) => (
                    <Box
                      key={`${eventItem.date}-${index}`}
                      sx={{ bgcolor: "rgba(255,255,255,0.08)", borderRadius: 2, p: 1.5 }}
                    >
                      <Typography variant="overline" sx={{ color: "rgba(255,122,162,0.9)", letterSpacing: "0.2em" }}>
                        {eventItem.type || "Event"}
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {eventItem.title}
                      </Typography>
                      {eventItem.notes ? (
                        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.6)" }}>
                          {eventItem.notes}
                        </Typography>
                      ) : null}
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </CardContent>
        </Card>

        <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
          <Card sx={{ flex: 1, borderRadius: 4 }}>
            <CardContent>
              <Typography variant="overline" sx={{ letterSpacing: "0.3em", color: "primary.main" }}>
                Ultrasound Focus
              </Typography>
              <Typography variant="h3" sx={{ fontSize: 24, mt: 1 }}>
                Key scans
              </Typography>
              <Stack spacing={2} mt={2}>
                {ultrasoundEvents.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Add ultrasound appointments to highlight them here.
                  </Typography>
                ) : (
                  ultrasoundEvents.map((eventItem) => (
                    <Card key={eventItem.date} variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "primary.main" }}>
                          {eventItem.type}
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {eventItem.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {format(parseISO(eventItem.date), "MMMM d, yyyy")}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1, borderRadius: 4 }}>
            <CardContent>
              <Typography variant="overline" sx={{ letterSpacing: "0.3em", color: "secondary.main" }}>
                Add to calendar
              </Typography>
              <Typography variant="h3" sx={{ fontSize: 24, mt: 1 }}>
                New appointment
              </Typography>
              <Stack spacing={2} mt={2} component="form" onSubmit={handleAddEvent}>
                <TextField
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleFormChange}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  name="type"
                  placeholder="Type (Ultrasound 1, Checkup, etc.)"
                  value={form.type}
                  onChange={handleFormChange}
                  size="small"
                />
                <TextField
                  name="title"
                  placeholder="Title"
                  value={form.title}
                  onChange={handleFormChange}
                  size="small"
                />
                <TextField
                  name="notes"
                  placeholder="Notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  size="small"
                  multiline
                  rows={3}
                />
                <Button type="submit" variant="contained" color="secondary">
                  Add event
                </Button>
              </Stack>
              {status.message ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
                  {status.message}
                </Typography>
              ) : null}
            </CardContent>
          </Card>
        </Stack>

        <Card sx={{ borderRadius: 4 }}>
          <CardContent>
            <Typography variant="overline" sx={{ letterSpacing: "0.3em", color: "primary.main" }}>
              Upcoming
            </Typography>
            <Typography variant="h3" sx={{ fontSize: 24, mt: 1 }}>
              Next highlights
            </Typography>
            {status.loading ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Loading data...
              </Typography>
            ) : upcomingEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No upcoming events yet.
              </Typography>
            ) : (
              <Stack spacing={2} mt={2} sx={{ maxHeight: 260, overflowY: "auto", pr: 1 }}>
                {upcomingEvents.map((eventItem) => (
                  <Card key={eventItem.date} variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent>
                      <Typography variant="overline" sx={{ color: "secondary.main" }}>
                        {eventItem.type || "Event"}
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {eventItem.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {format(parseISO(eventItem.date), "MMM d, yyyy")}
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 4 }}>
          <CardContent>
            <Typography variant="overline" sx={{ letterSpacing: "0.3em", color: "primary.main" }}>
              Medical Progress Summary
            </Typography>
            <Typography variant="h3" sx={{ fontSize: 24, mt: 1 }}>
              From the latest reports
            </Typography>
            <Stack spacing={2} mt={2}>
              {medicalSummary.map((item) => (
                <Card key={item.title} variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Typography variant="overline" sx={{ color: "primary.main" }}>
                      {item.date}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {item.title}
                    </Typography>
                    <Stack spacing={0.5} mt={1}>
                      {item.points.map((point) => (
                        <Typography key={point} variant="body2" color="text.secondary">
                          • {point}
                        </Typography>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 4 }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="overline" sx={{ letterSpacing: "0.3em", color: "primary.main" }}>
                  GitHub Sync
                </Typography>
                <Typography variant="h3" sx={{ fontSize: 24, mt: 1 }}>
                  Update data in the repo
                </Typography>
              </Box>
              <Button variant="contained" onClick={handleSync} disabled={status.saving}>
                {status.saving ? "Syncing..." : "Sync to GitHub"}
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Use a classic PAT with repo scope. Settings are stored locally in your browser.
            </Typography>
            <Divider sx={{ my: 3 }} />
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  name="owner"
                  label="GitHub owner"
                  value={settings.owner}
                  onChange={handleSettingsChange}
                  fullWidth
                  size="small"
                />
                <TextField
                  name="repo"
                  label="Repository"
                  value={settings.repo}
                  onChange={handleSettingsChange}
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  name="branch"
                  label="Branch (default main)"
                  value={settings.branch}
                  onChange={handleSettingsChange}
                  fullWidth
                  size="small"
                />
                <TextField
                  name="token"
                  label="GitHub token"
                  type="password"
                  value={settings.token}
                  onChange={handleSettingsChange}
                  fullWidth
                  size="small"
                />
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  name="jsonPath"
                  label="public/data/pregnancy-data.json"
                  value={settings.jsonPath}
                  onChange={handleSettingsChange}
                  fullWidth
                  size="small"
                />
                <TextField
                  name="xlsxPath"
                  label="public/data/pregnancy-data.xlsx"
                  value={settings.xlsxPath}
                  onChange={handleSettingsChange}
                  fullWidth
                  size="small"
                />
              </Stack>
              {status.error ? (
                <Typography variant="body2" color="error">
                  {status.error}
                </Typography>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

export default App;
