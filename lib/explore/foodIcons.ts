/**
 * 美食 → emoji 圖示（地圖 marker 與彈卡共用）。
 * 現況 recommendations 的 sub_category 多為 null，故主要靠「店名」比對；查無一律回通用 🍴。
 * 純前端、零 API。要更準可日後在 travel-rec-build 補 sub_category。
 *
 * 順序有意義：較專一的關鍵字排前面（命中即回），避免「火雞肉飯」被泛用「飯」搶先。
 */
const RULES: [RegExp, string][] = [
  [/咖啡|coffee|caf[eé]/i, '☕'],
  [/火雞|雞肉飯/i, '🍗'],
  [/鴨肉|鵝肉|鴨|鵝/i, '🍖'],
  [/海鮮|海產|生猛|seafood/i, '🦞'],
  [/魚頭|鰻魚|鬼頭刀|魚$/i, '🐟'],
  [/牛排|排館|steak/i, '🥩'],
  [/火鍋|鍋物|薑母鴨|羊肉爐/i, '🍲'],
  [/燒烤|燒肉|串燒|碳烤|烤肉/i, '🍢'],
  [/水餃|餃子|包子|湯包|餛飩|鍋貼/i, '🥟'],
  [/蔥油餅|抓餅|捲餅|餅$/i, '🫓'],
  [/麵包|烘焙|吐司|貝果|bakery/i, '🥐'],
  [/拉麵|牛肉麵|麵食|noodle|麵$/i, '🍜'],
  [/麻糬|湯圓|米苔目|米台目|粄|糬|粽/i, '🍡'],
  [/愛玉|豆花|仙草|粉圓|冰|剉冰|刨冰|霜淇淋|冰淇淋|雪花/i, '🍧'],
  [/蛋糕|甜點|甜品|布丁|dessert/i, '🍰'],
  [/手搖|飲料|茶飲|冷飲|奶茶|drink|茶/i, '🧋'],
  [/早餐|早午餐|brunch/i, '🥪'],
  [/便當|定食|焢肉|滷肉|燴飯|飯$/i, '🍱'],
  [/披薩|pizza|義式|義大利|pasta/i, '🍕'],
  [/漢堡|burger|速食/i, '🍔'],
  [/素食|蔬食|vegan|vegetarian/i, '🥗'],
  [/臭豆腐|滷味|鹹酥|鹽酥|小吃|夜市|攤/i, '🍢'],
  [/酒吧|居酒屋|bar/i, '🍶'],
]

/** 取得美食對應 emoji；優先 subCategory，再用 name 輔助比對，皆無則通用 🍴。 */
export function foodIcon(subCategory: string | null | undefined, name?: string | null): string {
  const hay = `${subCategory ?? ''} ${name ?? ''}`
  for (const [re, emoji] of RULES) if (re.test(hay)) return emoji
  return '🍴'
}
