// client/src/i18n.ts
// Bilingual (English / Chinese) UI strings. `zh` is typed against `en`'s
// keys, so a key missing from either side is a compile error.

export type Lang = 'en' | 'zh';

const STORAGE_KEY = 'luchess.lang';

const en = {
  'lang.switch': '中文',
  'title.home': 'luchess',
  'title.game': 'luchess - Game',
  'title.history': 'luchess - Game history',

  'home.tagline': 'Play chess with friends — no ads, no sign-up, just share a link and start',
  'home.timeControl': 'Time control',
  'home.unlimited': 'Unlimited',
  'home.custom': 'Custom…',
  'home.customMinutes': 'Custom minutes',
  'home.increment': 'Increment per move',
  'home.side': 'Playing side',
  'home.random': 'Random',
  'home.white': 'White',
  'home.black': 'Black',
  'home.variant': 'Variant',
  'home.create': 'Create game',
  'home.history': 'Game history',
  'home.joinLabel': 'Join a room',
  'home.joinPlaceholder': '6-digit room number',
  'home.join': 'Join',
  'home.joinInvalid': 'Enter a 6-digit room number',
  'home.joinNotFound': 'Room not found or expired',

  'variant.chess': 'Standard',
  'variant.chess.desc': 'Classic chess rules — no extra setup needed',
  'variant.chess960': 'Chess960',
  'variant.chess960.desc': 'The back rank is shuffled randomly every game',
  'variant.3check': 'Three-check',
  'variant.3check.desc': 'Check the king three times to win',
  'variant.kingofthehill': 'King of the Hill',
  'variant.kingofthehill.desc': 'Move your king into one of the central four squares to win',
  'variant.atomic': 'Atomic',
  'variant.atomic.desc': 'Captured pieces explode and take nearby units with them',
  'variant.antichess': 'Antichess',
  'variant.antichess.desc': 'Capture is mandatory — the first side to lose all pieces wins',
  'variant.racingkings': 'Racing Kings',
  'variant.racingkings.desc': 'No checks allowed — the first king to reach the 8th rank wins',
  'variant.horde': 'Horde',
  'variant.horde.desc': "White has 36 pawns against black's standard army",
  'variant.crazyhouse': 'Crazyhouse',
  'variant.crazyhouse.desc': 'Captured pieces join your hand — drop them back onto the board',
  'variant.fogofwar': 'Fog of War',
  'variant.fogofwar.desc': 'You only see squares your pieces can reach — capture the king to win',

  'game.waiting': 'Waiting for opponent... Share this link with a friend:',
  'game.copyInvite': 'Copy invite link',
  'game.copied': 'Copied!',
  'game.copiedFallback': 'Selected, press Ctrl+C to copy',
  'game.resign': 'Resign',
  'game.draw': 'Draw',
  'game.undo': 'Undo',
  'game.gameOver': 'Game over',
  'game.opponentOffersDraw': 'Opponent offers a draw',
  'game.opponentRequestsUndo': 'Opponent requests undo',
  'game.accept': 'Accept',
  'game.reject': 'Reject',

  'history.title': 'Game history',
  'history.previous': 'Previous',
  'history.next': 'Next',

  'result.whiteWins': 'White wins',
  'result.blackWins': 'Black wins',
  'result.draw': 'Draw',

  'reason.checkmate': 'checkmate',
  'reason.stalemate': 'stalemate',
  'reason.insufficient-material': 'insufficient material',
  'reason.variant-end': 'variant rule',
  'reason.threefold-repetition': 'threefold repetition',
  'reason.fifty-move': 'fifty-move rule',
  'reason.resignation': 'resignation',
  'reason.draw-agreement': 'draw agreed',
  'reason.timeout': 'time out',
  'reason.king-captured': 'king captured',

  'error.notInProgress': 'The game is not in progress',
  'error.spectator': 'Spectators cannot do that',
  'error.notYourTurn': "It's not your turn",
  'error.illegalMove': 'Illegal move',
  'error.noDrawOffer': 'There is no draw offer to answer',
  'error.noUndoOffer': 'There is no undo request to answer',
  'error.noMoveToUndo': 'There is no move to undo',
} as const;

export type I18nKey = keyof typeof en;

const zh: Record<I18nKey, string> = {
  'lang.switch': 'EN',
  'title.home': 'luchess',
  'title.game': 'luchess - 对局',
  'title.history': 'luchess - 历史对局',

  'home.tagline': '和朋友下国际象棋——无广告、免注册，分享链接就能开始',
  'home.timeControl': '用时',
  'home.unlimited': '不限时',
  'home.custom': '自定义…',
  'home.customMinutes': '自定义分钟数',
  'home.increment': '每步加秒',
  'home.side': '执子',
  'home.random': '随机',
  'home.white': '白方',
  'home.black': '黑方',
  'home.variant': '玩法',
  'home.create': '创建对局',
  'home.history': '历史对局',
  'home.joinLabel': '加入房间',
  'home.joinPlaceholder': '6 位房间号',
  'home.join': '加入',
  'home.joinInvalid': '请输入 6 位房间号',
  'home.joinNotFound': '房间不存在或已过期',

  'variant.chess': '标准',
  'variant.chess.desc': '经典国际象棋规则，无需额外设置',
  'variant.chess960': '960 随机开局',
  'variant.chess960.desc': '每局随机打乱底线棋子的排列',
  'variant.3check': '三将',
  'variant.3check.desc': '将军对方三次即获胜',
  'variant.kingofthehill': '山丘之王',
  'variant.kingofthehill.desc': '把王走进中心四格之一即获胜',
  'variant.atomic': '原子棋',
  'variant.atomic.desc': '吃子会爆炸，波及周围的棋子',
  'variant.antichess': '反吃棋',
  'variant.antichess.desc': '能吃必须吃，先输光所有棋子的一方获胜',
  'variant.racingkings': '赛王棋',
  'variant.racingkings.desc': '不允许将军，先把王走到第 8 行的一方获胜',
  'variant.horde': '蜂群棋',
  'variant.horde.desc': '白方 36 个兵对阵黑方完整兵力',
  'variant.crazyhouse': '疯狂屋',
  'variant.crazyhouse.desc': '吃掉的子进入手牌，可以空投回棋盘',
  'variant.fogofwar': '暗棋',
  'variant.fogofwar.desc': '只能看见自己棋子能走到的格子，吃掉对方的王获胜',

  'game.waiting': '等待对手加入…把这个链接发给朋友：',
  'game.copyInvite': '复制邀请链接',
  'game.copied': '已复制！',
  'game.copiedFallback': '已选中，按 Ctrl+C 复制',
  'game.resign': '认输',
  'game.draw': '求和',
  'game.undo': '悔棋',
  'game.gameOver': '对局结束',
  'game.opponentOffersDraw': '对手提议和棋',
  'game.opponentRequestsUndo': '对手请求悔棋',
  'game.accept': '接受',
  'game.reject': '拒绝',

  'history.title': '历史对局',
  'history.previous': '上一步',
  'history.next': '下一步',

  'result.whiteWins': '白方胜',
  'result.blackWins': '黑方胜',
  'result.draw': '和棋',

  'reason.checkmate': '将杀',
  'reason.stalemate': '逼和',
  'reason.insufficient-material': '子力不足',
  'reason.variant-end': '玩法规则判定',
  'reason.threefold-repetition': '三次重复局面',
  'reason.fifty-move': '五十步规则',
  'reason.resignation': '认输',
  'reason.draw-agreement': '双方同意和棋',
  'reason.timeout': '超时',
  'reason.king-captured': '王被吃掉',

  'error.notInProgress': '对局未在进行中',
  'error.spectator': '观战者不能进行此操作',
  'error.notYourTurn': '还没轮到你',
  'error.illegalMove': '不合法的走法',
  'error.noDrawOffer': '没有待回应的和棋提议',
  'error.noUndoOffer': '没有待回应的悔棋请求',
  'error.noMoveToUndo': '没有可以悔的棋',
};

export const DICTIONARIES: Record<Lang, Record<I18nKey, string>> = { en, zh };

export function detectLang(stored: string | null, navigatorLang: string | undefined): Lang {
  if (stored === 'en' || stored === 'zh') return stored;
  return navigatorLang?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

// localStorage can be missing (tests) or throw (blocked site data, some
// private windows) — either way, behave as if nothing was stored.
function readStoredLang(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: Lang = detectLang(readStoredLang(), typeof navigator === 'undefined' ? undefined : navigator.language);

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not persisted — the choice still applies for this page view.
  }
  if (typeof document !== 'undefined') document.dispatchEvent(new Event('langchange'));
}

export function hasKey(key: string): key is I18nKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

export function t(key: I18nKey): string {
  return DICTIONARIES[current][key];
}

export function variantLabel(id: string): string {
  const key = `variant.${id}`;
  return hasKey(key) ? t(key) : id;
}

export function resultText(result: string | null, reason: string | null): string {
  const outcome =
    result === '1-0'
      ? t('result.whiteWins')
      : result === '0-1'
        ? t('result.blackWins')
        : result === '1/2-1/2'
          ? t('result.draw')
          : (result ?? '');
  if (!reason) return outcome;
  const reasonKey = `reason.${reason}`;
  return `${outcome} · ${hasKey(reasonKey) ? t(reasonKey) : reason}`;
}

// The server reports errors as fixed English strings (see server/src/room.ts);
// map the known ones to translations and show anything else verbatim.
const ERROR_KEYS: Record<string, I18nKey> = {
  'game is not in progress': 'error.notInProgress',
  'not your turn': 'error.notYourTurn',
  'illegal move': 'error.illegalMove',
  'no pending draw offer for you': 'error.noDrawOffer',
  'no pending undo offer for you': 'error.noUndoOffer',
  'no move to undo': 'error.noMoveToUndo',
};

export function errorText(message: string): string {
  if (message.startsWith('spectators cannot')) return t('error.spectator');
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, message) ? t(ERROR_KEYS[message]) : message;
}
