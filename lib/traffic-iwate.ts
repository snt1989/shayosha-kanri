// 岩手県の取締り・オービス情報（ページの中に、そのまま出すための控え）。
//
// (1) 速度取締りの重点路線：岩手県警察が公表している「速度取締り指針」（令和8年9月版。高速隊と16警察署）を読んで、まとめたもの。
//     出典ページ：https://www.pref.iwate.jp/kenkei/kotsu/anzen/3000502.html （ページの更新日：令和8年9月17日）
//     指針は半年ごと（3月・9月）に新しくなる。新しい版が出たら、ここを書き直すこと。
//     PDFの表から読み取れなかった項目（区間・時間帯・規制速度）は空にして、check: true を付けてある（画面に「原本で確認」と出る）。
// (2) オービス：警察は設置場所の一覧を公表していない。民間の投稿サイト（オービスガイド）に載っている地点を、参考として載せる。
//     いまも設置されているかは、確かめていない。
export const IWATE_META = {
  title: '岩手県警察「速度取締り指針」',
  edition: '令和8年9月版',
  period: '令和8年9月〜令和9年2月ごろ（半年ごとに更新）',
  pageUrl: 'https://www.pref.iwate.jp/kenkei/kotsu/anzen/3000502.html',
  collectedAt: '2026-11-20',
};
const PDF = 'https://www.pref.iwate.jp/kenkei/_res/projects/project_kenkei/_page_/003/000/502/';

// geo：地図に出すための地名（区間の両端）。地名から地図の位置を引くので、おおよその位置になる
export type IwateRoute = { road: string; section?: string; limit?: string; time?: string; reason?: string; check?: boolean; geo?: string[] };
export type IwateUnit = { key: string; name: string; pdf: string; routes: IwateRoute[]; points: string[] };

export const IWATE_UNITS: IwateUnit[] = [
  {
    key: 'kousoku',
    name: '高速道路交通警察隊',
    pdf: `${PDF}s_r0809_00kousoku.pdf`,
    routes: [
      { road: '東北自動車道', section: '一関IC〜平泉前沢IC', time: '5:00〜19:00', reason: '事故が多い区間', check: true },
      { road: '東北自動車道', section: '花巻IC〜盛岡南IC', time: '5:00〜19:00', reason: '事故が多い区間', check: true },
      { road: '東北自動車道', section: '松尾八幡平IC〜秋田県境', time: '5:00〜19:00', reason: '事故が多い区間', check: true },
      { road: '八戸自動車道', section: '安代JCT〜浄法寺IC', limit: '80km/h', time: '10:00〜21:00', reason: '10〜12時台、18〜21時台に事故' },
    ],
    points: ['重大事故・事故の多い時間帯の取締りを強化', '指定速度120km/hの区間での取締り・警戒を強化', 'シートベルト、携帯電話の使用、車間距離不保持、通行帯違反も重点'],
  },
  {
    key: 'higashi',
    name: '盛岡東警察署',
    pdf: `${PDF}s_r0809_01higashi.pdf`,
    routes: [
      { road: '国道4号', section: '高松〜見前', reason: '国道で事故が最多。追突が多い。早朝に死亡事故', check: true, geo: ['盛岡市高松', '盛岡市見前'] },
      { road: '国道106号', section: '川目〜簗川', limit: '50km/h又は法定', reason: '実際の走行速度が高く、重傷事故の割合が高い', check: true, geo: ['盛岡市川目', '盛岡市簗川'] },
    ],
    points: ['通学路・生活道路で、可搬式オービス（移動式）による速度取締り', '信号無視・一時不停止・横断歩行者妨害の取締り', '繁華街を中心に飲酒運転の取締り', '自転車の取締り'],
  },
  {
    key: 'nishi',
    name: '盛岡西警察署',
    pdf: `${PDF}s_r0809_02nishi.pdf`,
    routes: [
      { road: '国道4号', section: '盛岡市下厨川〜滝沢市砂込', limit: '50km/h又は法定', reason: '人身事故が増加。追突が多い。交通量が多く速度も速い', check: true, geo: ['盛岡市下厨川', '滝沢市砂込'] },
      { road: '国道46号', section: '雫石町橋場〜滝沢市大釜', limit: '50km/h又は法定', reason: '人身事故が増加。追突が多い。交通量が多く速度も速い', check: true, geo: ['岩手郡雫石町橋場', '滝沢市大釜'] },
    ],
    points: ['交差点の事故・自転車の事故への取締りを強化', '赤色灯をつけた駐留監視'],
  },
  {
    key: 'iwate',
    name: '岩手警察署',
    pdf: `${PDF}s_r0809_03iwate.pdf`,
    routes: [
      { road: '国道4号', section: '岩手町川口〜御堂', limit: '50km/h又は法定', reason: '管内の人身事故の約半数が、この3路線', check: true, geo: ['岩手郡岩手町川口', '岩手郡岩手町御堂'] },
      { road: '国道281号', section: '岩手町大坊〜葛巻町繋', limit: '50km/h又は法定', reason: '正面衝突・追突のおそれ', check: true, geo: ['岩手郡岩手町大坊', '岩手郡葛巻町葛巻'] },
      { road: '国道282号', section: '八幡平市平舘〜兄畑', limit: '50km/h又は法定', reason: '管内の人身事故の約半数が、この3路線', check: true, geo: ['八幡平市平舘', '八幡平市兄畑'] },
    ],
    points: ['赤色灯をつけた警戒', '信号無視・一時不停止・携帯電話の使用・横断歩行者妨害の取締り', '自転車の取締りを強化', '通学路・生活道路で、可搬式オービス（移動式）を活用'],
  },
  {
    key: 'shiwa',
    name: '紫波警察署',
    pdf: `${PDF}s_r0809_04shiwa.pdf`,
    routes: [
      { road: '国道4号', section: '紫波町南日詰', limit: '法定', time: '16:00〜20:00', reason: '人身事故の約25％が、この路線', check: true, geo: ['紫波郡紫波町南日詰'] },
      { road: '国道456号', section: '紫波町栃内〜彦部', limit: '50km/h', time: '6:00〜9:00、15:00〜18:00', reason: '児童・生徒の通行が多い。住民から要望', check: true, geo: ['紫波郡紫波町栃内', '紫波郡紫波町彦部'] },
      { road: '主要地方道 盛岡和賀線', section: '矢巾町高田・流通センター南〜紫波町土舘', limit: '50km/h', time: '8:00〜12:00、14:00〜18:00', reason: '大型車の往来が多い', check: true, geo: ['紫波郡矢巾町高田', '紫波郡紫波町土舘'] },
    ],
    points: ['通学路で、横断歩行者妨害の取締りを強化', '信号無視・一時不停止の取締りを強化', '赤色灯をつけた駐留監視'],
  },
  {
    key: 'hanamaki',
    name: '花巻警察署',
    pdf: `${PDF}s_r0809_05hanamaki.pdf`,
    routes: [
      { road: '国道4号', section: '花巻市下似内〜石鳥谷町', limit: '法定', time: '6:00〜20:00', reason: '交通量が多く、直線が長くて速度が出やすい。追突が約7割', check: true, geo: ['花巻市下似内', '花巻市石鳥谷町好地'] },
      { road: '県道 山の神西宮野目線', section: '花巻市山の神〜西宮野目', limit: '50km/h又は40km/h', time: '6:00〜20:00', reason: '直線が長くて速度が出やすい。歩行者・自転車の被害', check: true, geo: ['花巻市山の神', '花巻市西宮野目'] },
    ],
    points: ['飲酒運転などの悪質な違反の取締りを強化', '横断歩行者妨害の取締りを強化'],
  },
  {
    key: 'kitakami',
    name: '北上警察署',
    pdf: `${PDF}s_r0809_06kitakami.pdf`,
    routes: [
      { road: '国道4号', reason: '出退勤のときの交通量が多く、安全不確認などの事故が目立つ', check: true },
      { road: '国道107号', reason: '出退勤のときの交通量が多く、安全不確認などの事故が目立つ', check: true },
      { road: '県道 相去飯豊線', reason: '出退勤のときの交通量が多く、安全不確認などの事故が目立つ', check: true },
    ],
    points: ['繁華街で飲酒運転の取締りを強化', '生活道路・通学路で速度違反の取締りを強化', '横断歩行者妨害の取締りを強化', '自転車の取締りを強化'],
  },
  {
    key: 'oshu',
    name: '奥州警察署',
    pdf: `${PDF}s_r0809_07oshu.pdf`,
    routes: [
      { road: '国道4号', section: '金ケ崎〜前沢（バイパスを含む）', limit: '50km/h（法定の区間あり）', time: '8:00〜18:00', reason: '直線が多く、速度が出やすい', check: true, geo: ['胆沢郡金ケ崎町西根', '奥州市前沢'] },
      { road: '主要地方道 水沢米里線', section: '水沢〜江刺愛宕', limit: '50km/h', reason: '直線が続く片側2車線で、速度が出やすい', check: true, geo: ['奥州市水沢', '奥州市江刺愛宕'] },
      { road: '県道 衣川水沢線', limit: '50km/h', reason: '横断歩行者の死亡・重傷事故が多い', check: true },
    ],
    points: ['朝夕の通勤・通学の時間帯に、携帯電話の使用の取締りと、赤色灯をつけた駐留監視', '飲酒運転の取締りを強化', '悪質・危険な自転車運転の取締りを強化'],
  },
  {
    key: 'ichinoseki',
    name: '一関警察署',
    pdf: `${PDF}s_r0809_08ichinoseki.pdf`,
    routes: [
      { road: '国道4号', section: '平泉〜真柴', limit: '50km/h又は法定', time: '6:00〜20:00', reason: '過去3年に人身事故17件。追突・正面衝突の重傷事故', check: true, geo: ['西磐井郡平泉町平泉', '一関市真柴'] },
      { road: '主要地方道 一関大東線', section: '山目〜舞川', limit: '50km/h', time: '6:00〜20:00', reason: '過去3年に人身事故17件。交差点の出会い頭など', check: true, geo: ['一関市山目', '一関市舞川'] },
    ],
    points: ['横断歩行者妨害・信号無視・携帯電話の使用の取締り', '赤色灯をつけた駐留監視'],
  },
  {
    key: 'senmaya',
    name: '千厩警察署',
    pdf: `${PDF}s_r0809_09senmaya.pdf`,
    routes: [
      { road: '国道284号', section: '薄衣・清田・折壁地区', limit: '50km/h（折壁の一部は60km/h）', time: '7:00〜19:00', reason: '追突が多く、重傷事故も', check: true, geo: ['一関市川崎町薄衣', '一関市室根町折壁'] },
      { road: '国道343号', section: '猿沢・大原地区', limit: '50km/h（猿沢の一部は60km/h）', reason: '交差点の事故が多い。路外逸脱の死亡事故', check: true, geo: ['一関市大東町猿沢', '一関市大東町大原'] },
      { road: '国道456号', section: '千厩・摺沢地区', limit: '50km/h', time: '10:00〜20:00', reason: '車と歩行者の死亡事故', geo: ['一関市千厩町千厩', '一関市大東町摺沢'] },
      { road: '主要地方道 一関大東線', section: '摺沢・東山地区', limit: '50km/h', time: '7:00〜19:00、16:00〜20:00', reason: '横断歩道の歩行者と車の事故。通勤・通学と下校の時間帯', check: true, geo: ['一関市大東町摺沢', '一関市東山町長坂'] },
    ],
    points: ['登下校の時間帯を中心に、横断歩行者妨害の取締りを強化', '幹線道路で、携帯電話の使用・シートベルトの集団取締り'],
  },
  {
    key: 'ofunato',
    name: '大船渡警察署',
    pdf: `${PDF}s_r0809_10ohunato.pdf`,
    routes: [
      { road: '国道45号', reason: '交通量の多い幹線道路。速度超過の事故は重大事故になりやすい', check: true },
      { road: '国道107号', section: '住田町内', time: '7:00〜18:00', reason: '交通量の多い幹線道路。速度超過の事故は重大事故になりやすい', check: true, geo: ['気仙郡住田町世田米'] },
      { road: '国道340号', reason: '交通量の多い幹線道路。速度超過の事故は重大事故になりやすい', check: true },
    ],
    points: ['通学路・生活道路で、可搬式オービス（移動式）による取締り', '携帯電話の使用・一時不停止・横断歩行者妨害の取締り', '自転車の取締り'],
  },
  {
    key: 'tono',
    name: '遠野警察署',
    pdf: `${PDF}s_r0809_11tono.pdf`,
    routes: [
      { road: '国道283号', section: '遠野市松崎町', limit: '50km/h', time: '9:00〜20:00', reason: '商業施設が集まり、事故が集中', geo: ['遠野市松崎町'] },
      { road: '国道107号', section: '遠野市小友町', limit: '法定', time: '6:00〜16:00', reason: '沿岸へ向かう道で速度が速い。早朝の速度超過', geo: ['遠野市小友町'] },
      { road: '国道396号', section: '遠野市綾織町', limit: '50km/h', time: '6:00〜14:00', reason: '速度超過の重傷事故。小学校の通学路', geo: ['遠野市綾織町'] },
    ],
    points: ['自転車の違反の取締りを強化', '交差点の出会い頭事故の対策（信号無視・一時不停止の取締り）'],
  },
  {
    key: 'kamaishi',
    name: '釜石警察署',
    pdf: `${PDF}s_r0809_12kamaishi.pdf`,
    routes: [
      { road: '国道45号', section: '釜石市唐丹町〜大槌町吉里吉里', limit: '50km/h', time: '9:00〜20:00', reason: '横断中の歩行者が、速度超過の車にはねられる死亡事故', check: true, geo: ['釜石市唐丹町', '上閉伊郡大槌町吉里吉里'] },
      { road: '国道283号', section: '釜石市甲子町〜松原町', limit: '50km/h', time: '9:00〜20:00', reason: '前方不注視の追突が多い', check: true, geo: ['釜石市甲子町', '釜石市松原町'] },
    ],
    points: ['横断歩行者妨害・信号無視・一時不停止の取締り', '自転車の悪質・危険な違反の取締りを強化', '通学路などで、可搬式オービス（移動式）による取締り', '市街地の駐車違反の取締りを強化', '昼夜を問わず、パトカーによる取締り'],
  },
  {
    key: 'miyako',
    name: '宮古警察署',
    pdf: `${PDF}s_r0809_13miyako.pdf`,
    routes: [
      { road: '国道45号', section: '宮古市田老〜津軽石', limit: '法定又は50km/h', time: '10:00〜18:00', reason: '追突・出会い頭の事故が多い', check: true, geo: ['宮古市田老', '宮古市津軽石'] },
      { road: '国道106号', section: '宮古市宮町〜区界', limit: '50km/h', time: '10:00〜18:00', reason: '追突が多い', check: true, geo: ['宮古市宮町', '宮古市区界'] },
    ],
    points: ['横断歩行者妨害の取締りを強化', '飲酒運転の取締りを強化'],
  },
  {
    key: 'iwaizumi',
    name: '岩泉警察署',
    pdf: `${PDF}s_r0809_14iwaizumi.pdf`,
    routes: [{ road: '国道455号（国道340号と重なる区間を含む）', section: '岩泉町門〜小本', limit: '50km/h（一部は法定・40km/h）', time: '9:00〜18:00', reason: '対向車線へのはみ出しによる正面衝突、単独の衝突が、日中に発生', geo: ['下閉伊郡岩泉町岩泉', '下閉伊郡岩泉町小本'] }],
    points: [],
  },
  {
    key: 'kuji',
    name: '久慈警察署',
    pdf: `${PDF}s_r0809_15kuji.pdf`,
    routes: [
      { road: '国道45号', section: '洋野町種市〜普代村', limit: '50km/h又は法定', time: '7:00〜20:00', reason: '交通量が多く、人身事故が集中', check: true, geo: ['九戸郡洋野町種市', '下閉伊郡普代村'] },
      { road: '国道281号', limit: '50km/h又は法定', time: '7:00〜20:00', reason: '郊外で速度が速く、単独の死亡・重傷事故', check: true },
    ],
    points: ['交差点の違反の取締り', '赤色灯をつけた駐留監視', '自転車の取締りを強化'],
  },
  {
    key: 'ninohe',
    name: '二戸警察署',
    pdf: `${PDF}s_r0809_16ninohe.pdf`,
    routes: [
      { road: '国道4号', section: '一戸町小繋〜二戸市金田一', reason: '交通量が多く、速度が出やすい。追突が約7割', check: true, geo: ['二戸郡一戸町小繋', '二戸市金田一'] },
      { road: '県道 二戸一戸線', section: '二戸市石切所〜堀野', reason: '歩行者が被害にあう人身事故が多い', check: true, geo: ['二戸市石切所', '二戸市堀野'] },
    ],
    points: ['交差点の違反の取締り', '赤色灯をつけた交通監視'],
  },
];

// オービス（参考）。出典：オービスガイド https://orbis-guide.com/pref/?pk=03 （民間の投稿サイト。2026-11-20 に見た内容）
export const IWATE_ORBIS_SOURCE = { name: 'オービスガイド（民間の投稿サイト）', url: 'https://orbis-guide.com/pref/?pk=03' };
export type IwateOrbis = { fixed: boolean; road: string; dir: string; place: string; type: string };
export const orbisGeo = (o: IwateOrbis) => o.place.replace(/\s/g, '');
export const IWATE_ORBIS: IwateOrbis[] = [
  { fixed: true, road: '東北自動車道', dir: '上り', place: '紫波郡矢巾町 広宮沢', type: 'レーダー式' },
  { fixed: true, road: '東北自動車道', dir: '上り', place: '花巻市 石鳥谷町大興寺', type: 'ループコイル式' },
  { fixed: true, road: '東北自動車道', dir: '下り', place: '胆沢郡金ケ崎町 西根', type: 'ループコイル式' },
  { fixed: true, road: '国道4号', dir: '南行き', place: '岩手郡岩手町 沼宮内', type: 'ループコイル式' },
  { fixed: true, road: '国道4号', dir: '北行き', place: '紫波郡紫波町 犬渕', type: 'レーダー式' },
  { fixed: true, road: '国道46号', dir: '東行き', place: '滝沢市 大釜吉水', type: 'レーダー式' },
  { fixed: true, road: '国道106号', dir: '東行き', place: '宮古市 門馬田代', type: 'レーダー式' },
  { fixed: false, road: '国道4号（盛岡バイパス）', dir: '下り', place: '盛岡市 東仙北2丁目', type: '移動式（見かけた報告）' },
  { fixed: false, road: '市道', dir: '北東行き', place: '盛岡市 西見前', type: '移動式（見かけた報告）' },
  { fixed: false, road: '市道', dir: '南東行き', place: '宮古市 西町1丁目', type: '移動式（見かけた報告）' },
];

// 路線ごとにまとめる（「国道4号」を走るときに、どこが重点かを続けて見られるように）
export function iwateByRoad(): { road: string; items: (IwateRoute & { unit: string; pdf: string })[] }[] {
  const map = new Map<string, (IwateRoute & { unit: string; pdf: string })[]>();
  for (const u of IWATE_UNITS) {
    for (const r of u.routes) {
      const key = r.road.replace(/（.*?）/g, '').replace(/^(主要地方道|県道)\s*/, '');
      map.set(key, [...(map.get(key) || []), { ...r, unit: u.name, pdf: u.pdf }]);
    }
  }
  const rank = (road: string) => (road.includes('自動車道') ? 0 : /^国道(\d+)号/.test(road) ? 1000 + Number(road.match(/^国道(\d+)号/)![1]) : 9000);
  return [...map.entries()].map(([road, items]) => ({ road, items })).sort((a, b) => rank(a.road) - rank(b.road) || a.road.localeCompare(b.road, 'ja'));
}

// 規制（季節の通行止めなど）。公式の発表を見て書いたもの。毎年、時期が変わるので、シーズンごとに見直すこと。
export type IwateClosure = { road: string; section: string; period: string; note?: string; source: { name: string; url: string }; geo: string[] };
export const IWATE_CLOSURES: IwateClosure[] = [
  {
    road: '八幡平アスピーテライン（県道23号 大更八幡平線）',
    section: '八幡平市緑ヶ丘〜見返峠（秋田県境） 10.6km',
    period: '令和8年11月4日(水)17:00 〜 令和9年4月15日(木)10:00（開通予定）',
    note: '冬期通行止め。開通のあとも、しばらく夜間（17:00〜翌8:30）は通行止め',
    source: { name: 'いわての旅（岩手県観光協会）', url: 'https://iwatetabi.jp/topic/225728/' },
    geo: ['八幡平市緑ヶ丘'],
  },
  {
    road: '八幡平樹海ライン（県道318号 八幡平公園線）',
    section: '見返峠〜松川温泉',
    period: '令和8年11月4日(水)17:00 〜 令和9年4月23日(金)10:00（開通予定）',
    note: '冬期通行止め',
    source: { name: 'いわての旅（岩手県観光協会）', url: 'https://iwatetabi.jp/topic/225728/' },
    geo: ['八幡平市松尾寄木'],
  },
  {
    road: '国道397号',
    section: '奥州市胆沢若柳 平七沢〜秋田県境 16.3km',
    period: '例年 11月上旬 〜 翌年5月中旬ごろ（前の冬は 令和7年11月7日〜令和8年5月21日）',
    note: '今季の開始日は、県の発表で確かめてください',
    source: { name: '岩手県 県南広域振興局土木部', url: 'https://www.pref.iwate.jp/kennan/doboku/1013759/1099216.html' },
    geo: ['奥州市胆沢若柳'],
  },
];

// いまの規制・交通の情報（毎日変わるので、公式のページを開いて見る）
export const IWATE_LIVE_LINKS: { group: string; items: { icon: string; label: string; note: string; url: string }[] }[] = [
  {
    group: '通行止め・規制（いま）',
    items: [
      { icon: '🚧', label: '岩手県道路情報提供サービス：通行規制', note: '県が管理する道路の通行止め・片側交互通行など', url: 'https://www.douro.com/urgency.php' },
      { icon: '❄️', label: '岩手県道路情報提供サービス：冬期通行止めの地図', note: '冬の間、通れない区間', url: 'https://www.douro.com/map_winter.php?sid=1' },
      { icon: '🛣', label: '国土交通省 岩手河川国道事務所：冬期通行不能区間', note: '国道（国の管理）の冬の通行止め', url: 'http://www.thr.mlit.go.jp/iwate/jimusho/dourokanri_jouhou/toukikisei/1.htm' },
      { icon: '📣', label: '岩手県 県土整備部：通行規制のお知らせ', note: '工事・災害・冬期の規制の発表', url: 'https://www.pref.iwate.jp/kendozukuri/kendoseibi/news/1083528/1085549/index.html' },
    ],
  },
  {
    group: '渋滞・交通情報',
    items: [
      { icon: '🚗', label: '高速道路の交通情報（NEXCO東日本 ドラとら）', note: '東北道・八戸道・釜石道などの渋滞・規制・チェーン規制', url: 'https://www.drivetraffic.jp/' },
      { icon: '🗾', label: '日本道路交通情報センター（JARTIC）', note: '一般道・高速道路の渋滞・事故・通行止め', url: 'https://www.jartic.or.jp/' },
    ],
  },
];
