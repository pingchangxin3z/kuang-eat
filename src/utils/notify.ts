/**
 * 抢饭成功时通过飞书群机器人 Webhook 发送提醒
 */

/** 飞书机器人 Webhook 发文本 */
export async function sendFeishuWebhook(webhookUrl: string, text: string): Promise<void> {
  const url = webhookUrl.trim()
  if (!url) return
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: { text }
    })
  })
}

/** 发送一条测试消息，用于验证 Webhook 是否配置正确 */
export async function sendFeishuTest(webhookUrl: string): Promise<void> {
  const url = webhookUrl.trim()
  if (!url) return
  await sendFeishuWebhook(url, '【狂吃】这是一条测试消息，收到说明飞书提醒配置正确。')
}

/**
 * 抢饭成功时发送飞书提醒（不阻塞，静默忽略失败）
 * 未配置昵称时不发提醒（便于群里识别是谁）
 */
export async function notifyOnGrabSuccess(
  webhookUrl: string,
  displayName: string,
  summary: string,
  detail: string
): Promise<void> {
  if (!webhookUrl.trim() || !displayName.trim()) return
  const who = `${displayName.trim()} `
  const text = `【狂吃】${who}抢饭成功\n${summary}\n${detail}`
  await sendFeishuWebhook(webhookUrl, text).catch(() => {})
}

/**
 * 抢饭未成功时发送飞书提醒（不阻塞，静默忽略失败）
 * 未配置昵称时不发提醒
 */
export async function notifyOnGrabFail(
  webhookUrl: string,
  displayName: string,
  summary: string
): Promise<void> {
  if (!webhookUrl.trim() || !displayName.trim()) return
  const who = `${displayName.trim()} `
  const text = `【狂吃】${who}抢饭未成功\n${summary}`
  await sendFeishuWebhook(webhookUrl, text).catch(() => {})
}
