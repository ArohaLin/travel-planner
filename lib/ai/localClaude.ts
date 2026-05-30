import { spawn } from 'child_process'

/**
 * 本機測試模式：用 Claude Code CLI（claude -p）取代 AI API 呼叫。
 *
 * 啟用條件：環境變數 LOCAL_AI=1（只在 .env.local 設定，Vercel 不設 → 自動走 API）。
 * 走訂閱制、不計費，適合本機開發/測試。
 *
 * 限制：claude -p 為非串流、一次回傳全文。呼叫端會包成「假串流」（拿到全文後一次吐出）。
 */

export function isLocalAI(): boolean {
  return process.env.LOCAL_AI === '1'
}

interface LocalChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 把 system prompt + 歷史 + 當次輸入組成單一 prompt，交給 `claude -p` 執行，回傳全文。
 * 失敗時 throw。
 */
export function runLocalClaude(params: {
  systemPrompt: string
  history?: LocalChatMessage[]
  userMessage: string
  /** 逾時毫秒，預設 120 秒 */
  timeoutMs?: number
}): Promise<string> {
  const { systemPrompt, history = [], userMessage, timeoutMs = 240000 } = params

  // 將對話組合成單一 prompt 字串（claude -p 透過 stdin 讀取）
  const historyText = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n')

  // system prompt 已透過 --system-prompt 旗標帶入，stdin 只放歷史 + 本次輸入
  const combinedPrompt = [
    historyText ? `## 先前對話\n${historyText}` : '',
    `## 使用者本次輸入\n${userMessage}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return new Promise<string>((resolve, reject) => {
    // --print 非互動輸出
    // --tools "" 禁用所有工具，確保只做純文字生成（不讀檔、不執行）
    // --system-prompt 直接帶入我們的指示（取代預設 coding 用 system prompt）
    // 注意：不可用 --bare，否則會強制只接受 ANTHROPIC_API_KEY，無法用訂閱制 OAuth 認證
    // cwd 設 /tmp 避免自動載入專案 CLAUDE.md 干擾輸出
    const child = spawn(
      'claude',
      ['-p', '--tools', '', '--system-prompt', systemPrompt],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/tmp',
        env: process.env,
      },
    )

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`claude -p 逾時（${timeoutMs}ms）`))
    }, timeoutMs)

    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`無法執行 claude CLI：${err.message}`))
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`claude -p 失敗（exit ${code}）：${stderr.slice(0, 300)}`))
        return
      }
      resolve(stdout.trim())
    })

    // 透過 stdin 餵入 prompt
    child.stdin.write(combinedPrompt)
    child.stdin.end()
  })
}
