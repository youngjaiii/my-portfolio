// 🐾 Mateyou Push Notification Service Worker

// 멤버십 관련 알림 타입
const MEMBERSHIP_NOTIFICATION_TYPES = [
  'membership_expiry_reminder',
  'membership_renewed',
  'membership_renewal_failed'
];

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "🐾 Mateyou 알림";
  const body = data.body || "새로운 메시지가 도착했어요!";
  const icon = data.icon || "/favicon.ico";
  const badge = "/favicon.ico";
  const tag = data.tag || "mateyou-message";
  const url = data.url || "/";
  const notificationType = data.type || data.notification_type || "";

  const options = {
    body,
    icon,
    badge,
    tag,
    data: {
      url,
      timestamp: Date.now(),
      type: notificationType,
      ...data
    },
    requireInteraction: false,
    silent: false
  };

  // 멤버십 관련 알림인 경우 클라이언트로 메시지 전달
  if (MEMBERSHIP_NOTIFICATION_TYPES.includes(notificationType)) {
    event.waitUntil(
      Promise.all([
        self.registration.showNotification(title, options),
        // 열려있는 모든 클라이언트에 메시지 전달
        clients.matchAll({ type: "window" }).then((clientList) => {
          clientList.forEach((client) => {
            client.postMessage({
              type: 'MEMBERSHIP_NOTIFICATION',
              payload: {
                type: notificationType,
                title: title,
                body: body,
                membershipName: data.membership_name || data.membershipName,
                price: data.price,
              }
            });
          });
        })
      ])
    );
  } else {
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

// 알림 클릭 시 앱 열기
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // 이미 열린 탭이 있으면 그 탭을 포커스
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // 열린 탭이 없으면 새 탭 열기
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

console.log("🔔 Mateyou Service Worker 등록됨");