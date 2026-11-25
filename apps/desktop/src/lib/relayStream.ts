import { parseNtfyLines, type NtfyLine } from "@nuga/core";

/**
 * 공개 중계(ntfy)의 실시간 연결 하나.
 *
 * 이 탭이 듣는 통로를 모두 한 연결(EventSource)에 묶는다: 내 기록 통로 + 테스트 아이디 자리표.
 * 공개 서버는 인터넷 주소 하나에 열린 연결 30개 · 요청 1분 12건만 받으므로, 통로마다 따로 열지 않는다.
 * - 통로가 바뀌면 새 주소로 다시 연다. 끊기면 간격을 늘려 가며 다시 연다 (다시 열 때마다 요청 1건).
 * - 서버가 연결을 열 때와 45초마다 보내는 신호에서 서버 시각을 읽는다 (기기 시계가 틀려도 '30분'을 같이 잰다).
 */
export interface RelayConsumer {
  /** 중계 주소 */
  base: string;
  /** 듣는 통로 */
  topics: string[];
  /** 내 통로의 메시지 한 줄 (raw = 받은 글 그대로) */
  onLine: (line: NtfyLine, raw: string) => void;
  /** 연결이 열림. again = 끊겼다가 다시 열림 (그사이 놓친 것을 조회로 받아야 한다) */
  onOpen?: (again: boolean) => void;
}

const ALIVE_MS = 120_000;   // 서버 신호(45초마다)가 이만큼 없으면 죽은 연결로 본다
const RETRY_MIN = 15_000, RETRY_MAX = 300_000;

class RelayStream {
  private consumers = new Map<string, RelayConsumer>();
  private es: EventSource | null = null;
  private url = "";
  private everOpened = false;
  private aliveAt = 0;
  private retryMs = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watch: ReturnType<typeof setInterval> | null = null;
  /** 서버 시각(초) − 이 기기 시각(초) */
  private offset: number | null = null;

  set(name: string, c: RelayConsumer) { this.consumers.set(name, c); this.later(); }
  clear(name: string) { if (this.consumers.delete(name)) this.later(); }
  /** 듣는 쪽이 잇달아 바뀌어도(로그인하는 동안 등) 연결은 한 번만 다시 연다: 다시 열 때마다 요청 1건이 든다 */
  private pending: ReturnType<typeof setTimeout> | null = null;
  private later() {
    if (this.pending) return;
    this.pending = setTimeout(() => { this.pending = null; this.apply(); }, 30);
  }

  /** 연결이 열릴 때까지 기다린다 (이미 열려 있으면 바로). 시간 안에 안 열리면 false */
  opened(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const look = () => {
        if (!this.pending && this.url && this.url === this.wanted() && this.openUrl === this.url && this.es) return resolve(true);
        if (Date.now() - t0 >= timeoutMs) return resolve(false);
        setTimeout(look, 50);
      };
      look();
    });
  }
  /** 서버의 open 신호를 받은 주소 (지금 주소와 같으면 열려 있는 것) */
  private openUrl = "";

  /** 실시간 연결이 살아 있는가 (살아 있으면 확인용 조회를 드물게 해도 된다) */
  alive(): boolean { return !!this.es && Date.now() - this.aliveAt < ALIVE_MS; }

  /** 중계 서버의 지금 시각(초). 아직 서버 시각을 본 적이 없으면 null */
  now(): number | null { return this.offset === null ? null : Math.floor(Date.now() / 1000 + this.offset); }
  /** 서버가 알려 준 시각을 기억한다 (연결 신호 · 메시지를 보낸 응답) */
  noteTime(sec: unknown) { if (typeof sec === "number" && sec > 1_000_000_000) this.offset = sec - Date.now() / 1000; }

  private wanted(): string {
    const all = [...this.consumers.values()];
    if (!all.length || typeof EventSource !== "function") return "";
    const topics = [...new Set(all.flatMap((c) => c.topics))].filter(Boolean).sort();
    return topics.length ? `${all[0].base.replace(/\/+$/, "")}/${topics.join(",")}/sse` : "";
  }

  private apply() {
    const url = this.wanted();
    if (url === this.url) return;
    this.close();
    this.url = url; this.retryMs = 0; this.everOpened = false; this.openUrl = "";
    if (url) this.open();
  }

  private close() {
    try { this.es?.close(); } catch { /* 이미 닫힘 */ }
    this.es = null;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.watch) { clearInterval(this.watch); this.watch = null; }
  }

  private open() {
    const url = this.url;
    if (!url) return;
    let es: EventSource;
    try { es = new EventSource(url); } catch { this.retryLater(); return; }
    this.es = es;
    const signal = (e: Event) => {
      if (this.es !== es) return;
      const data = (e as MessageEvent).data;
      if (typeof data !== "string") return;   // 브라우저 자신의 open 알림 (서버 신호가 아님)
      this.aliveAt = Date.now(); this.retryMs = 0;
      try { this.noteTime((JSON.parse(data) as { time?: number }).time); } catch { /* 시각 없는 신호 */ }
      if (e.type === "open") {
        const again = this.everOpened; this.everOpened = true; this.openUrl = url;
        for (const c of this.consumers.values()) c.onOpen?.(again);
      }
    };
    es.addEventListener("open", signal);
    es.addEventListener("keepalive", signal);
    es.onmessage = (e) => {
      if (this.es !== es) return;
      const raw = String(e.data || "");
      const [line] = parseNtfyLines(raw);
      if (!line) return;
      this.aliveAt = Date.now();
      this.noteTime(line.time);
      for (const c of this.consumers.values()) if (!line.topic || c.topics.includes(line.topic)) c.onLine(line, raw);
    };
    es.onerror = () => {
      if (this.es !== es) return;
      // 서버가 거절했으면(요청이 많음 등) 브라우저는 다시 열지 않는다: 간격을 두고 직접 다시 연다
      if (es.readyState === 2) { try { es.close(); } catch { /* 이미 닫힘 */ } this.es = null; this.retryLater(); }
    };
    if (!this.watch) this.watch = setInterval(() => {
      // 신호가 끊긴 채 열려만 있는 연결 (절전에서 깨어난 뒤 등): 다시 연다
      if (this.es && this.aliveAt && Date.now() - this.aliveAt > ALIVE_MS && !this.retryTimer) { try { this.es.close(); } catch { /* 이미 닫힘 */ } this.es = null; this.retryLater(2000); }
    }, 30_000);
  }

  private retryLater(first?: number) {
    if (this.retryTimer || !this.url) return;
    this.retryMs = first ?? Math.min(RETRY_MAX, this.retryMs ? this.retryMs * 2 : RETRY_MIN);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; if (this.url && !this.es) this.open(); }, this.retryMs);
  }
}

export const relayStream = new RelayStream();
