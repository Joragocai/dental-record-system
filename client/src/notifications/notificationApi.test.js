import assert from "node:assert/strict";
import test from "node:test";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "./notificationApi.js";

const options = {
  accessToken: "fictional-token",
  apiBaseUrl: "https://api.example.test/api"
};

test("notification API helpers use recipient-owned authenticated endpoints", async () => {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization") ?? ""
    });

    if (url.endsWith("/unread-count")) {
      return new Response(JSON.stringify({ unread: 2 }), { status: 200 });
    }
    if (url.endsWith("/read-all")) {
      return new Response(JSON.stringify({ markedRead: 2 }), { status: 200 });
    }
    if (url.endsWith("/read")) {
      return new Response(JSON.stringify({ read: true }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };

  const requestOptions = { ...options, fetchImpl };
  await listNotifications(requestOptions, 25);
  assert.equal(await getUnreadNotificationCount(requestOptions), 2);
  await markNotificationRead("44444444-4444-4444-8444-444444444444", requestOptions);
  assert.equal(await markAllNotificationsRead(requestOptions), 2);

  assert.deepEqual(calls, [
    {
      url: "https://api.example.test/api/notifications?limit=25",
      method: "GET",
      authorization: "Bearer fictional-token"
    },
    {
      url: "https://api.example.test/api/notifications/unread-count",
      method: "GET",
      authorization: "Bearer fictional-token"
    },
    {
      url: "https://api.example.test/api/notifications/44444444-4444-4444-8444-444444444444/read",
      method: "PATCH",
      authorization: "Bearer fictional-token"
    },
    {
      url: "https://api.example.test/api/notifications/read-all",
      method: "POST",
      authorization: "Bearer fictional-token"
    }
  ]);
});

test("notification API rejects malformed notification and read payloads", async () => {
  const malformedListFetch = async () =>
    new Response(JSON.stringify([{
      id: "44444444-4444-4444-8444-444444444444",
      category: "account",
      eventType: "ACCOUNT_TEST",
      title: "",
      body: "Body",
      readAt: null,
      createdAt: "2026-10-10T00:00:00.000Z"
    }]), { status: 200 });
  await assert.rejects(
    listNotifications({ ...options, fetchImpl: malformedListFetch }),
    /invalid notification/
  );

  const malformedReadFetch = async () =>
    new Response(JSON.stringify({ read: false }), { status: 200 });
  await assert.rejects(
    markNotificationRead(
      "44444444-4444-4444-8444-444444444444",
      { ...options, fetchImpl: malformedReadFetch }
    ),
    /invalid read acknowledgement/
  );
});

test("notification API rejects malformed count payloads", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    return new Response(
      JSON.stringify(url.endsWith("/read-all") ? { markedRead: -1 } : { unread: "two" }),
      { status: 200 }
    );
  };

  await assert.rejects(
    getUnreadNotificationCount({ ...options, fetchImpl }),
    /invalid unread count/
  );
  await assert.rejects(
    markAllNotificationsRead({ ...options, fetchImpl }),
    /invalid read count/
  );
});
