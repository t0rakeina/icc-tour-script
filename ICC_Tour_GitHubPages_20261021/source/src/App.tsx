"use client";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Cue = {
  id: string;
  script: string;
  note: string;
};

type Slot = {
  id: string;
  start: string;
  duration: number;
  title: string;
  cues: Cue[];
};

type Workshop = {
  title: string;
  subtitle: string;
  slots: Slot[];
};

type SavedState = {
  workshop: Workshop;
  activeSlot: number;
  activeCue: number;
  scheduleShiftMs: number;
};

type AppView = "setup" | "review" | "run";

const STORAGE_KEY = "workshop-cue-timeline-v1";

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const sampleWorkshop: Workshop = {
  title: "ICC アニュアル2026 ギャラリーツアー",
  subtitle: "14:00–15:00｜ギャラリーA・B",
  slots: [
    {
      id: "slot-1",
      start: "14:00",
      duration: 5,
      title: "挨拶・概要説明",
      cues: [
        {
          id: "cue-1-1",
          script:
            "皆さま、こんにちは。本日はICC アニュアル2026のギャラリーツアーにご参加いただき、ありがとうございます。",
          note: "参加者の表情を見ながら、ゆっくり話し始める。",
        },
        {
          id: "cue-1-2",
          script:
            "途中での入退場は自由です。気分が悪くなった場合やお困りのことがあれば、お近くのスタッフへお声がけください。",
          note: "記録撮影とAuracastの案内もここで行う。",
        },
      ],
    },
    {
      id: "slot-2",
      start: "14:05",
      duration: 7,
      title: "作品をよく見てみよう",
      cues: [
        {
          id: "cue-2-1",
          script:
            "では、この作品を少し離れたところから見てみましょう。\n\n最初に気づいたことは何ですか？\n\n色、形、音、動きなど、どんなことでも構いません。",
          note: "30秒ほど、声に出さずにじっくり観察する時間を取る。",
        },
        {
          id: "cue-2-2",
          script:
            "近くで見ると、先ほどとは違って見えるところがあります。気になった部分を一つ探してみてください。",
          note: "作品やほかの鑑賞者との距離に注意する。",
        },
      ],
    },
    {
      id: "slot-3",
      start: "14:12",
      duration: 8,
      title: "感じたことを共有",
      cues: [
        {
          id: "cue-3-1",
          script:
            "見ている間に気づいたことや、少し不思議に思ったことはありましたか？",
          note: "正解を求めず、2〜3名から短く言葉をもらう。",
        },
      ],
    },
    {
      id: "slot-4",
      start: "14:20",
      duration: 25,
      title: "ギャラリーB 作品紹介",
      cues: [
        {
          id: "cue-4-1",
          script:
            "ここからはギャラリーBへ移動します。会場の混雑状況を見ながら、紹介する順番を変える場合があります。",
          note: "A・B・Cのユニット順は、本番前の確認画面で変更できる。",
        },
      ],
    },
    {
      id: "slot-5",
      start: "14:45",
      duration: 14,
      title: "まとめ・再鑑賞",
      cues: [
        {
          id: "cue-5-1",
          script:
            "ツアーのあとも、気になった作品をもう一度ゆっくりご覧いただけます。\n\n本日はご参加いただき、ありがとうございました。",
          note: "イベント予定、再来館、Podcastを案内する。",
        },
      ],
    },
  ],
};

function cloneSample(): Workshop {
  return JSON.parse(JSON.stringify(sampleWorkshop)) as Workshop;
}

function parseDuration(value: string): number {
  const cleaned = value.trim();
  if (!cleaned) return 0;
  const minuteMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*分/);
  if (minuteMatch) return Number(minuteMatch[1]);
  const clockMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (clockMatch) {
    return Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
  }
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseClock(value: string): number | null {
  const match = value.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function timerParts(ms: number): { minutes: number; seconds: string } {
  const absoluteSeconds = Math.max(0, Math.ceil(Math.abs(ms) / 1000));
  return {
    minutes: Math.floor(absoluteSeconds / 60),
    seconds: String(absoluteSeconds % 60).padStart(2, "0"),
  };
}

function splitDelimited(input: string): string[][] {
  const delimiter = input.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.replace(/[\s　／/・]/g, "").toLowerCase();
}

function workshopFromTable(
  input: string,
): { workshop: Workshop; warnings: string[] } {
  const rows = splitDelimited(input);
  if (!rows.length) {
    throw new Error("読み込める行がありません。");
  }

  const knownHeaders = [
    "所要",
    "時間",
    "大項目",
    "台本",
    "ポイント",
    "注意事項",
  ];
  const firstLooksLikeHeader = rows[0].some((cell) =>
    knownHeaders.some((label) => normalizeHeader(cell).includes(label)),
  );
  const headers = firstLooksLikeHeader
    ? rows.shift()!.map(normalizeHeader)
    : ["所要", "時間", "大項目", "台本", "ポイント注意事項"];

  const findColumn = (labels: string[], fallback: number) => {
    const index = headers.findIndex((header) =>
      labels.some((label) => header.includes(normalizeHeader(label))),
    );
    return index >= 0 ? index : fallback;
  };

  const durationColumn = findColumn(["所要", "所要時間"], 0);
  const timeColumn = findColumn(["時間", "開始"], 1);
  const titleColumn = findColumn(["大項目", "項目"], 2);
  const scriptColumn = findColumn(["台本", "スクリプト"], 3);
  const noteColumn = findColumn(["ポイント", "注意事項", "ポイント注意事項"], 4);

  const slots: Slot[] = [];
  const warnings: string[] = [];
  let inheritedDuration = "";
  let inheritedStart = "";
  let inheritedTitle = "";

  rows.forEach((row, rowIndex) => {
    const explicitDuration = row[durationColumn]?.trim() ?? "";
    const explicitStart = row[timeColumn]?.trim() ?? "";
    const explicitTitle = row[titleColumn]?.trim() ?? "";
    const script = row[scriptColumn]?.trim() ?? "";
    const note = row[noteColumn]?.trim() ?? "";

    inheritedDuration = explicitDuration || inheritedDuration;
    inheritedStart = explicitStart || inheritedStart;
    inheritedTitle = explicitTitle || inheritedTitle;

    if (!script && !note && !explicitTitle && !explicitStart && !explicitDuration) {
      return;
    }

    const startsNewSlot =
      slots.length === 0 ||
      Boolean(explicitStart) ||
      Boolean(explicitDuration) ||
      (Boolean(explicitTitle) &&
        explicitTitle !== slots[slots.length - 1]?.title);

    if (startsNewSlot) {
      slots.push({
        id: uid(),
        start: inheritedStart,
        duration: parseDuration(inheritedDuration),
        title: inheritedTitle || `項目 ${slots.length + 1}`,
        cues: [],
      });
    }

    const slot = slots[slots.length - 1];
    if (script || note) {
      slot.cues.push({ id: uid(), script, note });
    }
    if (!slot.cues.length) {
      slot.cues.push({ id: uid(), script: "", note: "" });
    }

    if (explicitStart && parseClock(explicitStart) === null) {
      warnings.push(
        `${rowIndex + 1}行目：「${explicitStart}」は時刻ではないため、本番タイマーの対象外になります。`,
      );
    }
  });

  if (!slots.length) {
    throw new Error(
      "時間枠を読み取れませんでした。5列（所要・時間・大項目・台本・ポイント／注意事項）をコピーしてください。",
    );
  }

  slots.forEach((slot, index) => {
    if (!slot.start) warnings.push(`${index + 1}番目の項目に開始時刻がありません。`);
    if (slot.duration <= 0 && index < slots.length - 1) {
      const start = parseClock(slot.start);
      const next = parseClock(slots[index + 1].start);
      if (start !== null && next !== null && next > start) {
        slot.duration = next - start;
      }
    }
  });

  return {
    workshop: {
      title: "読み込んだ進行表",
      subtitle: `${slots.length}件の時間枠`,
      slots,
    },
    warnings,
  };
}

function slotStartMs(slot: Slot, shiftMs: number): number | null {
  const minutes = parseClock(slot.start);
  if (minutes === null) return null;
  const now = new Date();
  const base = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
  return base.getTime() + shiftMs;
}

function addMinutesToClock(value: string, minutesToAdd: number): string {
  const minutes = parseClock(value);
  if (minutes === null) return value;
  const shifted = (minutes + minutesToAdd + 24 * 60) % (24 * 60);
  return `${String(Math.floor(shifted / 60)).padStart(2, "0")}:${String(
    shifted % 60,
  ).padStart(2, "0")}`;
}

export default function Home() {
  const [view, setView] = useState<AppView>("setup");
  const [workshop, setWorkshop] = useState<Workshop>(cloneSample);
  const [pasteValue, setPasteValue] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [activeSlot, setActiveSlot] = useState(0);
  const [activeCue, setActiveCue] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [scheduleShiftMs, setScheduleShiftMs] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [savedAvailable, setSavedAvailable] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved) as SavedState;
        if (state.workshop?.slots?.length) {
          queueMicrotask(() => setSavedAvailable(true));
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    }
  }, []);

  // 本番画面では画面全体（ページ）のスクロールを止め、台本だけがスクロールするようにする。
  // 画面を切り替えたときは、ページ全体のスクロール位置も先頭へ戻す。
  useEffect(() => {
    const root = document.documentElement;
    if (view === "run") {
      root.classList.add("run-lock");
    } else {
      root.classList.remove("run-lock");
    }
    window.scrollTo(0, 0);
    return () => root.classList.remove("run-lock");
  }, [view]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (view !== "run") return;
    const payload: SavedState = {
      workshop,
      activeSlot,
      activeCue,
      scheduleShiftMs,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeCue, activeSlot, scheduleShiftMs, view, workshop]);

  const currentSlot = workshop.slots[activeSlot] ?? workshop.slots[0];
  const currentCue = currentSlot?.cues[activeCue] ?? currentSlot?.cues[0];
  const effectiveNowMs = pausedAt ?? now.getTime();
  const startMs = currentSlot
    ? slotStartMs(currentSlot, scheduleShiftMs)
    : null;
  const endMs =
    startMs === null || !currentSlot
      ? null
      : startMs + Math.max(0, currentSlot.duration) * 60_000;
  const remainingMs = endMs === null ? 0 : endMs - effectiveNowMs;
  const isOvertime = endMs !== null && remainingMs < 0;
  const endLabel = endMs === null ? "—" : formatClock(new Date(endMs));
  const remainingParts = timerParts(remainingMs);

  const nextScheduledSlot = useMemo(() => {
    for (let index = activeSlot + 1; index < workshop.slots.length; index += 1) {
      if (parseClock(workshop.slots[index].start) !== null) {
        return workshop.slots[index];
      }
    }
    return null;
  }, [activeSlot, workshop.slots]);

  const nextStartLabel = nextScheduledSlot
    ? (() => {
        const time = slotStartMs(nextScheduledSlot, scheduleShiftMs);
        return time ? formatClock(new Date(time)) : "—";
      })()
    : "終了";

  const timelineWindow = useMemo(() => {
    const windowSize = 5;
    const maxStart = Math.max(0, workshop.slots.length - windowSize);
    const start = Math.min(
      Math.max(0, activeSlot - Math.floor(windowSize / 2)),
      maxStart,
    );
    const end = Math.min(workshop.slots.length, start + windowSize);
    return {
      slots: workshop.slots.slice(start, end),
      start,
      hiddenBefore: start,
      hiddenAfter: workshop.slots.length - end,
    };
  }, [activeSlot, workshop.slots]);

  function readTable(value: string) {
    setError("");
    try {
      const result = workshopFromTable(value);
      setWorkshop(result.workshop);
      setWarnings(result.warnings);
      setActiveSlot(0);
      setActiveCue(0);
      setScheduleShiftMs(0);
      setView("review");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "表を読み込めませんでした。",
      );
    }
  }

  async function readCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const value = await file.text();
    setPasteValue(value);
    readTable(value);
    event.target.value = "";
  }

  function loadSample() {
    setWorkshop(cloneSample());
    setWarnings([]);
    setError("");
    setActiveSlot(0);
    setActiveCue(0);
    setScheduleShiftMs(0);
    setView("review");
  }

  function restoreSaved() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const state = JSON.parse(saved) as SavedState;
      setWorkshop(state.workshop);
      setActiveSlot(Math.min(state.activeSlot, state.workshop.slots.length - 1));
      setActiveCue(state.activeCue);
      setScheduleShiftMs(state.scheduleShiftMs ?? 0);
      setPausedAt(null);
      setView("run");
    } catch {
      setError("保存された進行表を復元できませんでした。");
    }
  }

  function updateSlot(index: number, patch: Partial<Slot>) {
    setWorkshop((current) => ({
      ...current,
      slots: current.slots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    }));
  }

  function updateCue(
    slotIndex: number,
    cueIndex: number,
    patch: Partial<Cue>,
  ) {
    setWorkshop((current) => ({
      ...current,
      slots: current.slots.map((slot, index) =>
        index === slotIndex
          ? {
              ...slot,
              cues: slot.cues.map((cue, currentCueIndex) =>
                currentCueIndex === cueIndex ? { ...cue, ...patch } : cue,
              ),
            }
          : slot,
      ),
    }));
  }

  function moveSlot(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= workshop.slots.length) return;
    setWorkshop((current) => {
      const slots = [...current.slots];
      [slots[index], slots[destination]] = [slots[destination], slots[index]];
      return { ...current, slots };
    });
  }

  function removeSlot(index: number) {
    if (workshop.slots.length <= 1) return;
    setWorkshop((current) => ({
      ...current,
      slots: current.slots.filter((_, slotIndex) => slotIndex !== index),
    }));
  }

  function addSlot() {
    const previous = workshop.slots[workshop.slots.length - 1];
    const start = addMinutesToClock(
      previous?.start ?? "14:00",
      previous?.duration || 5,
    );
    setWorkshop((current) => ({
      ...current,
      slots: [
        ...current.slots,
        {
          id: uid(),
          start,
          duration: 5,
          title: "新しい項目",
          cues: [{ id: uid(), script: "", note: "" }],
        },
      ],
    }));
  }

  function shiftAllTimes(minutes: number) {
    setWorkshop((current) => ({
      ...current,
      slots: current.slots.map((slot) => ({
        ...slot,
        start: addMinutesToClock(slot.start, minutes),
      })),
    }));
  }

  function beginRun() {
    setActiveSlot(0);
    setActiveCue(0);
    setPausedAt(null);
    setSavedAvailable(true);
    setView("run");
    if ("wakeLock" in navigator) {
      (
        navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<unknown> };
        }
      ).wakeLock?.request("screen").catch(() => undefined);
    }
  }

  function goNext() {
    if (!currentSlot) return;
    if (activeCue < currentSlot.cues.length - 1) {
      setActiveCue((value) => value + 1);
      return;
    }
    if (activeSlot < workshop.slots.length - 1) {
      setActiveSlot((value) => value + 1);
      setActiveCue(0);
    }
  }

  function goPrevious() {
    if (activeCue > 0) {
      setActiveCue((value) => value - 1);
      return;
    }
    if (activeSlot > 0) {
      const destination = activeSlot - 1;
      setActiveSlot(destination);
      setActiveCue(
        Math.max(0, workshop.slots[destination].cues.length - 1),
      );
    }
  }

  function selectSlot(index: number) {
    setActiveSlot(index);
    setActiveCue(0);
  }

  function togglePause() {
    if (pausedAt === null) {
      setPausedAt(Date.now());
    } else {
      setScheduleShiftMs((value) => value + (Date.now() - pausedAt));
      setPausedAt(null);
    }
  }

  function startCurrentNow() {
    if (!currentSlot) return;
    const base = slotStartMs(currentSlot, 0);
    if (base !== null) {
      setScheduleShiftMs(Date.now() - base);
      setPausedAt(null);
    }
  }

  function clearSaved() {
    localStorage.removeItem(STORAGE_KEY);
    setSavedAvailable(false);
    setPasteValue("");
    setWorkshop(cloneSample());
    setScheduleShiftMs(0);
    setActiveSlot(0);
    setActiveCue(0);
    setPausedAt(null);
    setView("setup");
  }

  if (view === "setup") {
    return (
      <main className="setup-shell">
        <section className="setup-panel" aria-labelledby="setup-title">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              W
            </span>
            <span>Workshop Cue</span>
            <span className="version-tag">初期版</span>
          </div>

          <div className="setup-copy">
            <p className="eyebrow">進行表を準備</p>
            <h1 id="setup-title">いつもの表を、そのまま本番の台本へ。</h1>
            <p>
              Googleスプレッドシートの5列をコピーして貼り付けるか、
              CSVファイルを読み込んでください。
            </p>
          </div>

          {savedAvailable && (
            <button className="restore-card" type="button" onClick={restoreSaved}>
              <span>
                <strong>前回の進行を続ける</strong>
                <small>台本・現在位置・時間調整を端末から復元</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          )}

          <div className="column-guide" aria-label="必要な列">
            {["所要", "時間", "大項目", "台本", "ポイント／注意事項"].map(
              (label, index) => (
                <span key={label}>
                  <b>{index + 1}</b>
                  {label}
                </span>
              ),
            )}
          </div>

          <label className="paste-field">
            <span>スプレッドシートから貼り付け</span>
            <textarea
              value={pasteValue}
              onChange={(event) => setPasteValue(event.target.value)}
              placeholder={
                "所要\t時間\t大項目\t台本\tポイント／注意事項\n5分\t14:00\t挨拶\t皆さま、こんにちは。\tゆっくり話す"
              }
            />
          </label>

          {error && <p className="error-message">{error}</p>}

          <div className="setup-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => readTable(pasteValue)}
              disabled={!pasteValue.trim()}
            >
              貼り付けた表を確認
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              CSVを選択
            </button>
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept=".csv,text/csv,text/tab-separated-values"
              onChange={readCsv}
            />
          </div>

          <button className="text-button" type="button" onClick={loadSample}>
            サンプル進行表で試す
          </button>

          <p className="privacy-note">
            読み込んだ内容は、この端末のブラウザ内に保存されます。
          </p>
        </section>
      </main>
    );
  }

  if (view === "review") {
    return (
      <main className="review-shell">
        <header className="review-header">
          <div>
            <button
              className="back-link"
              type="button"
              onClick={() => setView("setup")}
            >
              ← 読み込みへ戻る
            </button>
            <p className="eyebrow">読み込み結果を確認</p>
            <h1>本番前の最終チェック</h1>
          </div>
          <button className="primary-button" type="button" onClick={beginRun}>
            この内容で進行を開始
          </button>
        </header>

        <section className="review-meta">
          <label>
            <span>進行表タイトル</span>
            <input
              value={workshop.title}
              onChange={(event) =>
                setWorkshop((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>補足</span>
            <input
              value={workshop.subtitle}
              onChange={(event) =>
                setWorkshop((current) => ({
                  ...current,
                  subtitle: event.target.value,
                }))
              }
            />
          </label>
          <div className="time-shift">
            <span>開始時刻を一括変更</span>
            <div>
              <button type="button" onClick={() => shiftAllTimes(-5)}>
                −5分
              </button>
              <button type="button" onClick={() => shiftAllTimes(5)}>
                ＋5分
              </button>
            </div>
          </div>
        </section>

        {warnings.length > 0 && (
          <aside className="warning-box">
            <strong>確認してください</strong>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </aside>
        )}

        <section className="review-list" aria-label="時間枠一覧">
          {workshop.slots.map((slot, slotIndex) => (
            <article className="review-card" key={slot.id}>
              <div className="order-controls" aria-label="順番を変更">
                <span>{String(slotIndex + 1).padStart(2, "0")}</span>
                <button
                  type="button"
                  onClick={() => moveSlot(slotIndex, -1)}
                  disabled={slotIndex === 0}
                  aria-label="一つ上へ"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveSlot(slotIndex, 1)}
                  disabled={slotIndex === workshop.slots.length - 1}
                  aria-label="一つ下へ"
                >
                  ↓
                </button>
              </div>

              <div className="review-card-content">
                <div className="slot-fields">
                  <label>
                    <span>開始</span>
                    <input
                      type="time"
                      value={slot.start}
                      onChange={(event) =>
                        updateSlot(slotIndex, { start: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>所要（分）</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={slot.duration}
                      onChange={(event) =>
                        updateSlot(slotIndex, {
                          duration: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="title-field">
                    <span>大項目</span>
                    <input
                      value={slot.title}
                      onChange={(event) =>
                        updateSlot(slotIndex, { title: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => removeSlot(slotIndex)}
                    disabled={workshop.slots.length <= 1}
                  >
                    削除
                  </button>
                </div>

                <div className="cue-fields">
                  {slot.cues.map((cue, cueIndex) => (
                    <div className="cue-editor" key={cue.id}>
                      <span className="cue-count">台本 {cueIndex + 1}</span>
                      <label>
                        <span>スクリプト</span>
                        <textarea
                          value={cue.script}
                          onChange={(event) =>
                            updateCue(slotIndex, cueIndex, {
                              script: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>ポイント／注意事項</span>
                        <textarea
                          value={cue.note}
                          onChange={(event) =>
                            updateCue(slotIndex, cueIndex, {
                              note: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        <div className="review-footer">
          <button className="secondary-button" type="button" onClick={addSlot}>
            ＋ 時間枠を追加
          </button>
          <button className="primary-button" type="button" onClick={beginRun}>
            この内容で進行を開始
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="run-shell">
      <aside className="timeline-panel">
        <div className="timeline-brand">
          <div className="timeline-brand-row">
            <span>Workshop Cue</span>
            <button
              type="button"
              onClick={() => setView("review")}
              aria-label="進行表を編集"
            >
              編集
            </button>
          </div>
          <h1>{workshop.title}</h1>
          <p>{workshop.subtitle}</p>
        </div>

        <nav className="timeline-list" aria-label="進行タイムライン">
          {timelineWindow.hiddenBefore > 0 && (
            <button
              className="timeline-more"
              type="button"
              onClick={() => selectSlot(timelineWindow.start - 1)}
              aria-label={`前の項目を表示。ほかに${timelineWindow.hiddenBefore}件あります`}
            >
              ↑ 前に {timelineWindow.hiddenBefore} 件
            </button>
          )}
          {timelineWindow.slots.map((slot, visibleIndex) => {
            const index = timelineWindow.start + visibleIndex;
            const state =
              index === activeSlot
                ? "active"
                : index < activeSlot
                  ? "completed"
                  : "upcoming";
            return (
              <button
                className={`timeline-item ${state}`}
                type="button"
                key={slot.id}
                onClick={() => selectSlot(index)}
                aria-current={index === activeSlot ? "step" : undefined}
              >
                <span className="timeline-dot" aria-hidden="true" />
                <span className="timeline-copy">
                  <span className="timeline-time">
                    {addMinutesToClock(
                      slot.start,
                      Math.round(scheduleShiftMs / 60_000),
                    )}
                  </span>
                  <strong>{slot.title}</strong>
                </span>
              </button>
            );
          })}
          {timelineWindow.hiddenAfter > 0 && (
            <button
              className="timeline-more"
              type="button"
              onClick={() =>
                selectSlot(timelineWindow.start + timelineWindow.slots.length)
              }
              aria-label={`次の項目を表示。ほかに${timelineWindow.hiddenAfter}件あります`}
            >
              ↓ 後に {timelineWindow.hiddenAfter} 件
            </button>
          )}
        </nav>
      </aside>

      <section className="stage-panel">
        <header className="stage-header">
          <div>
            <p>
              項目 {activeSlot + 1} / {workshop.slots.length}
              {currentSlot?.cues.length > 1 &&
                `　台本 ${activeCue + 1} / ${currentSlot.cues.length}`}
            </p>
            <h2>{currentSlot?.title ?? "進行項目"}</h2>
          </div>
          <time dateTime={now.toISOString()}>{formatClock(now)}</time>
        </header>

        <div
          className={`deadline-bar ${isOvertime ? "overtime" : ""} ${
            pausedAt ? "paused" : ""
          }`}
        >
          <div className="deadline-end">
            <small>この項目の終了</small>
            <strong>
              {endLabel}
              <em>まで</em>
            </strong>
          </div>
          <div className="deadline-left">
            <small>
              {isOvertime ? "超過" : pausedAt ? "あと（停止中）" : "あと"}
            </small>
            <strong>
              {remainingParts.minutes}
              <em>分</em>
              {remainingParts.seconds}
              <em>秒</em>
            </strong>
          </div>
        </div>

        <div className="script-area">
          <article className="script-card" aria-live="polite">
            <p
              className="script-text"
              key={`${currentSlot?.id}:${currentCue?.id}`}
            >
              {currentCue?.script || "（この項目には台本がありません）"}
            </p>
            {currentCue?.note && (
              <aside className="note-card">
                <span>POINT</span>
                <p>{currentCue.note}</p>
              </aside>
            )}
          </article>
        </div>

        <footer className="control-bar">
          <div className="next-block">
            <span className="calendar-icon" aria-hidden="true">
              ▣
            </span>
            <span>
              <small>次は</small>
              <strong>{nextStartLabel}</strong>
            </span>
          </div>

          <div className="schedule-tools">
            <button type="button" onClick={() => setScheduleShiftMs((v) => v - 60_000)}>
              −1分
            </button>
            <button type="button" onClick={startCurrentNow}>
              今から
            </button>
            <button type="button" onClick={() => setScheduleShiftMs((v) => v + 60_000)}>
              ＋1分
            </button>
          </div>

          <div className="main-controls">
            <button type="button" onClick={goPrevious} aria-label="前の台本へ">
              <span aria-hidden="true">‹</span> 前へ
            </button>
            <button
              className={pausedAt ? "resume-button" : "pause-button"}
              type="button"
              onClick={togglePause}
            >
              {pausedAt ? "▶ 再開" : "Ⅱ 一時停止"}
            </button>
            <button type="button" onClick={goNext} aria-label="次の台本へ">
              次へ <span aria-hidden="true">›</span>
            </button>
          </div>
        </footer>

        <div className="run-utility">
          <button type="button" onClick={() => setView("review")}>
            進行表を確認
          </button>
          <button type="button" onClick={clearSaved}>
            保存を消して最初から
          </button>
        </div>
      </section>
    </main>
  );
}
