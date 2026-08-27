export function orderStatusKeyboard(orderId: string) {
  // callback: os:{orderId}:{STATUS}
  const short = orderId.slice(-8);
  return {
    inline_keyboard: [
      [
        { text: '✅ Qabul qilish', callback_data: `os:${orderId}:CONFIRMED` },
        { text: '👨‍🍳 Tayyorlanmoqda', callback_data: `os:${orderId}:PREPARING` },
      ],
      [
        { text: '📦 Tayyor', callback_data: `os:${orderId}:READY` },
        { text: '🚚 Yetkazilmoqda', callback_data: `os:${orderId}:DELIVERING` },
      ],
      [
        { text: '✔️ Yakunlash', callback_data: `os:${orderId}:COMPLETED` },
        { text: '❌ Bekor qilish', callback_data: `os:${orderId}:CANCELLED` },
      ],
    ],
  };
}
