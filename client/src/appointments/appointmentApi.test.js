import assert from "node:assert/strict";
import test from "node:test";
import {
  getSchedulingBootstrap,
  listCalendarAppointments,
  listCalendarWeekAppointments,
  searchSchedulingPatients
} from "./appointmentApi.js";

const options = {
  accessToken: "fictional-token",
  apiBaseUrl: "https://api.example.test/api"
};

test("appointment API helpers use bearer-authenticated protected endpoints", async () => {
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization") ?? ""
    });
    return new Response(JSON.stringify({ branches: [], capabilities: {} }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  await getSchedulingBootstrap({ ...options, fetchImpl });
  assert.deepEqual(calls, [{
    url: "https://api.example.test/api/appointments/scheduling-context",
    authorization: "Bearer fictional-token"
  }]);
});

test("weekly calendar helper keeps authenticated requests sequential to protect hosted database sessions", async () => {
  let active = 0;
  let peak = 0;
  const fetchImpl = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  await listCalendarWeekAppointments(
    "44444444-4444-4444-8444-444444444444",
    ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"],
    { ...options, fetchImpl }
  );

  assert.equal(peak, 1);
});

test("calendar and patient-search helpers encode operational filters safely", async () => {
  const urls = [];
  const fetchImpl = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  await listCalendarAppointments(
    { branchId: "44444444-4444-4444-8444-444444444444", date: "2026-10-09" },
    { ...options, fetchImpl }
  );
  await searchSchedulingPatients(
    "44444444-4444-4444-8444-444444444444",
    "Ana Cruz",
    { ...options, fetchImpl }
  );

  assert.equal(
    urls[0],
    "https://api.example.test/api/calendar?branchId=44444444-4444-4444-8444-444444444444&date=2026-10-09"
  );
  assert.equal(
    urls[1],
    "https://api.example.test/api/appointments/patient-search?branchId=44444444-4444-4444-8444-444444444444&q=Ana+Cruz"
  );
});
