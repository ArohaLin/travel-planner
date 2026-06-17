/**
 * 臨時樣版預覽頁（簡表功能 3 種風格給使用者挑選用）
 * 公開、免登入（middleware PUBLIC_ROUTES 已放行 /templates）。
 * 選定樣版、開始動工後即可刪除此頁與 middleware 的放行。
 */
export const dynamic = 'force-static'

const tableRows = (mono: boolean) => `
<tr><td colspan="5" style="padding:6px 8px;background:#E3F0DC;border-radius:8px;color:#5E8A3C;font-weight:600;">🚩 08:30 出發 · 台東市區民宿</td></tr>
<tr style="border-bottom:1px solid rgba(0,0,0,.06);"><td style="padding:8px 2px;vertical-align:top;${mono ? 'font-family:ui-monospace,monospace;' : ''}">11:30<br>13:00</td><td style="padding:8px 2px;vertical-align:top;opacity:.7;">1.5h</td><td style="padding:8px 2px;vertical-align:top;"><span style="font-size:13px;">🍽️</span> 綠島海產</td><td style="padding:8px 2px;vertical-align:top;">在地特色海鮮午餐</td><td style="padding:8px 2px;text-align:center;opacity:.4;">·</td></tr>
<tr style="border-bottom:1px solid rgba(0,0,0,.06);"><td style="padding:8px 2px;vertical-align:top;${mono ? 'font-family:ui-monospace,monospace;' : ''}">15:35<br>17:30</td><td style="padding:8px 2px;vertical-align:top;opacity:.7;">1.9h</td><td style="padding:8px 2px;vertical-align:top;"><span style="font-size:13px;">🌿</span> 森林公園</td><td style="padding:8px 2px;vertical-align:top;">單車漫遊琵琶湖</td><td style="padding:8px 2px;text-align:center;"><span style="background:#F0C674;color:#6b4a08;border-radius:5px;padding:1px 5px;font-size:9.5px;white-space:nowrap;">租車</span></td></tr>
<tr style="border-bottom:1px solid rgba(0,0,0,.06);"><td style="padding:8px 2px;vertical-align:top;${mono ? 'font-family:ui-monospace,monospace;' : ''}">18:30<br>20:00</td><td style="padding:8px 2px;vertical-align:top;opacity:.7;">1.5h</td><td style="padding:8px 2px;vertical-align:top;"><span style="font-size:13px;">🍜</span> 台東夜市</td><td style="padding:8px 2px;vertical-align:top;">在地小吃晚餐</td><td style="padding:8px 2px;text-align:center;opacity:.4;">·</td></tr>
<tr><td colspan="5" style="padding:6px 8px;background:#FBE8E2;border-radius:8px;color:#C2624A;font-weight:600;">🏁 21:00 結束 · 回台東市區民宿</td></tr>`

const meals = `
<div style="flex:1;background:#fff;border-radius:11px;padding:8px 4px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08);"><div style="font-size:15px;">🥐</div><div style="font-size:10px;opacity:.6;">早餐</div><div style="font-size:11.5px;font-weight:600;">民宿輕食</div></div>
<div style="flex:1;background:#fff;border-radius:11px;padding:8px 4px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08);"><div style="font-size:15px;">🍽️</div><div style="font-size:10px;opacity:.6;">午餐</div><div style="font-size:11.5px;font-weight:600;">綠島海產</div></div>
<div style="flex:1;background:#fff;border-radius:11px;padding:8px 4px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08);"><div style="font-size:15px;">🍜</div><div style="font-size:10px;opacity:.6;">晚餐</div><div style="font-size:11.5px;font-weight:600;">台東夜市</div></div>`

const thead = (color: string) => `
<thead><tr style="color:${color};font-size:10.5px;text-align:left;">
<td style="width:50px;padding:0 2px 6px;">時間</td><td style="width:30px;padding:0 2px 6px;">時長</td><td style="width:64px;padding:0 2px 6px;">景點</td><td style="padding:0 2px 6px;">內容</td><td style="width:30px;padding:0 2px 6px;text-align:center;">備註</td>
</tr></thead>`

const tplA = `
<div style="background:#E9E2D0;border-radius:18px;padding:14px;">
<div style="background:#FBF7EC;border-radius:14px;padding:16px 14px 18px;color:#5A4A3A;position:relative;overflow:hidden;">
<div style="position:absolute;top:10px;right:-18px;width:90px;height:22px;background:#A8D5BA;opacity:.7;transform:rotate(8deg);"></div>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#FBE0B0"/><circle cx="22" cy="24" r="11" fill="#F7C873"/><path d="M10 30 q12 -8 24 0" stroke="#E89B4B" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="17" cy="20" r="2" fill="#7A5C3A"/><circle cx="27" cy="20" r="2" fill="#7A5C3A"/></svg>
<div><div style="font-size:19px;font-weight:600;">第 4 天 · 台東</div><div style="font-size:12px;color:#A38B6E;">8/18（二）· 綠島歸來</div></div></div>
<div style="display:flex;gap:6px;margin:12px 0;">${meals}</div>
<div style="display:flex;align-items:center;gap:8px;background:#EFEAFb;border-radius:10px;padding:8px 12px;margin-bottom:14px;"><span style="font-size:18px;">🏨</span><div><span style="font-size:13px;font-weight:600;">住宿 · 台東市區民宿</span><span style="font-size:11px;color:#9A8FB5;margin-left:6px;">入住 21:00</span></div></div>
<table style="width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed;">${thead('#B89A72')}<tbody>${tableRows(false)}</tbody></table>
<div style="text-align:center;margin-top:12px;font-size:10px;color:#C9B89A;">✿ 唯讀簡表 · 隨行程自動更新 ✿</div>
</div></div>`

const tplB = `
<div style="background:#DDEBF5;border-radius:18px;padding:14px;">
<div style="background:#fff;border-radius:14px;overflow:hidden;color:#3D4A5C;">
<div style="background:linear-gradient(180deg,#9FD0F0,#CDE8F7);padding:14px 14px 30px;position:relative;">
<svg width="100%" height="46" viewBox="0 0 320 46" style="display:block;"><circle cx="44" cy="22" r="14" fill="#FFE08A"/><ellipse cx="120" cy="28" rx="26" ry="11" fill="#fff" opacity=".9"/><ellipse cx="150" cy="22" rx="20" ry="13" fill="#fff" opacity=".9"/><path d="M210 34 q14 -22 40 -18" stroke="#fff" stroke-width="2" fill="none" stroke-dasharray="3 4" stroke-linecap="round"/><g transform="translate(248,12) rotate(25)"><path d="M0 6 L18 0 L14 8 L18 12 L4 12 Z" fill="#F2785C"/></g><ellipse cx="290" cy="30" rx="22" ry="10" fill="#fff" opacity=".85"/></svg>
<div style="position:absolute;bottom:8px;left:16px;"><div style="font-size:20px;font-weight:600;color:#2C5878;">第 4 天 · 台東</div><div style="font-size:12px;color:#5B86A3;">8/18（二）· 綠島歸來</div></div></div>
<div style="padding:0 14px 16px;margin-top:-16px;">
<div style="display:flex;gap:6px;margin-bottom:12px;">${meals}</div>
<div style="display:flex;align-items:center;gap:8px;background:#EAF6F0;border-radius:12px;padding:9px 12px;margin-bottom:14px;"><span style="font-size:18px;">🏨</span><div><span style="font-size:13px;font-weight:600;color:#2E7D5B;">住宿 · 台東市區民宿</span><span style="font-size:11px;color:#7FAE96;margin-left:6px;">入住 21:00</span></div></div>
<table style="width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed;">${thead('#8AA0B5')}<tbody>${tableRows(false)}</tbody></table>
<div style="text-align:center;margin-top:12px;font-size:10px;color:#A8C0D0;">唯讀簡表 · 隨行程自動更新</div>
</div></div></div>`

const tplC = `
<div style="background:#3A3530;border-radius:18px;padding:14px;">
<div style="background:#F2E8D5;border-radius:12px;color:#4A4036;overflow:hidden;">
<div style="background:#2E7163;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;color:#F2E8D5;">
<div><div style="font-size:19px;font-weight:600;letter-spacing:1px;">DAY 4 · 台東</div><div style="font-size:11px;color:#A9D2C7;">8/18 TUE · 綠島歸來</div></div>
<svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="21" fill="none" stroke="#D9A441" stroke-width="2" stroke-dasharray="3 3"/><circle cx="23" cy="23" r="15" fill="#D9A441" opacity=".25"/><path d="M14 25 l6 0 3 -8 3 8 6 0" stroke="#E7C66A" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="23" y="38" text-anchor="middle" font-size="6" fill="#E7C66A" letter-spacing="1">TAITUNG</text></svg></div>
<div style="height:0;border-top:2px dashed #C9B89A;"></div>
<div style="padding:14px;">
<div style="display:flex;gap:6px;margin-bottom:12px;">${meals}</div>
<div style="display:flex;align-items:center;gap:8px;background:#2E7163;border-radius:8px;padding:9px 12px;margin-bottom:14px;color:#F2E8D5;"><span style="font-size:17px;">🏨</span><div><span style="font-size:13px;font-weight:600;">住宿 · 台東市區民宿</span><span style="font-size:11px;color:#A9D2C7;margin-left:6px;">入住 21:00</span></div></div>
<table style="width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed;">${thead('#9A7B43')}<tbody>${tableRows(true)}</tbody></table>
<div style="text-align:center;margin-top:12px;font-size:9.5px;color:#B0A079;letter-spacing:2px;">— 唯讀簡表 · 隨行程自動更新 —</div>
</div></div></div>`

function Block({ label, desc, html }: { label: string; desc: string; html: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>{desc}</div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export default function TemplatesPreview() {
  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '20px 14px 60px', fontFamily: '-apple-system, "PingFang TC", sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>簡表樣版預覽</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>台東 Day 4 範例。看完跟 Claude 說選 A / B / C。</p>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 2 }}>AI 插圖草稿（樣版 A 頁首）</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>本地 ComfyUI schnell 生成 · 方向示意</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/draft-illust-A.png" alt="AI 插圖草稿" style={{ width: '100%', borderRadius: 14, border: '1px solid #eee' }} />
      </div>
      <Block label="樣版 A · 手帳貼紙風" desc="奶油米底、紙膠帶、虛線框，溫馨可愛" html={tplA} />
      <Block label="樣版 B · 清新天空插畫風" desc="天空藍漸層頂、雲朵小飛機，清爽好讀" html={tplB} />
      <Block label="樣版 C · 復古車票印章風" desc="墨綠＋米黃、郵戳徽章、選孔虛線" html={tplC} />
    </div>
  )
}
