import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RECORDING, alignCandidates, fmtHM, fmtMD, lessonLabel, type AlignCandidate, type Category, type Transcript } from "@nuga/core";
import { catLabel, fillLesson, studentName, useStore } from "../store";
import { useTranscripts } from "../lib/transcripts";
import { Chip, Icon, Modal } from "./ui";

/** 단원·카테고리 기반 추천 문구 (후순위 기능의 1차 구현: 규칙 템플릿) */
function suggestions(cat: Category, title: string, memo: string): string[] {
  const t = title || "학습 내용";
  const m = memo.trim();
  const base: Record<Category, string[]> = {
    1: [`${t}에서 ${m || "핵심 개념"}에 대해 질문`, `${t}의 예외 사례에 대해 질문`, `${t}과 이전 단원 개념의 연결을 질문`],
    2: [`${t} 문제 풀이 과정을 설명하며 발표`, `${t} 실험 결과를 정리하여 발표`, `${m || t}에 대해 근거를 들어 발표`],
    3: [`${t} 모둠 활동에서 역할을 나누고 조율`, `모둠원의 오개념을 바로잡아 줌`, `${t} 실험에서 기록·정리를 담당`],
    4: [`${t} 관련 추가 자료를 찾아 정리`, `수업 후 ${t}에 대해 추가 질문`, `실험 기구 정리와 안전 확인을 자발적으로 수행`],
  };
  return base[cat];
}

export function SupplementModal() {
  const queue = useStore((s) => s.supplementQueue);
  const doc = useStore((s) => s.doc);
  const openSupplement = useStore((s) => s.openSupplement);
  const updateRecord = useStore((s) => s.updateRecord);
  const toast = useStore((s) => s.toast);
  const [idx, setIdx] = useState(0);
  const [note, setNote] = useState("");
  const [cat, setCat] = useState<Category>(1);
  const ref = useRef<HTMLTextAreaElement>(null);
  const tIndex = useTranscripts((s) => s.index);
  const tLoaded = useTranscripts((s) => s.loaded);
  const tLoad = useTranscripts((s) => s.load);
  const tGet = useTranscripts((s) => s.get);
  const [cands, setCands] = useState<AlignCandidate[]>([]);
  useEffect(() => { if (!tLoaded) tLoad(); }, [tLoaded]);

  const ids = queue.filter((id) => doc.records.some((r) => r.id === id));
  const rec = useMemo(() => { const r = doc.records.find((x) => x.id === ids[idx]); return r ? fillLesson(doc, r) : null; }, [doc, ids, idx]);

  useEffect(() => { if (rec) { setNote(rec.note || ""); setCat(rec.category); setTimeout(() => ref.current?.focus(), 30); } }, [rec?.id]);
  useEffect(() => { if (ids.length === 0) openSupplement([]); else if (idx >= ids.length) setIdx(ids.length - 1); }, [ids.length, idx]);

  // 수업 스크립트 후보: 1차 기록 시각 앞 60초 ~ 뒤 15초의 학생 발언 (v3 7.4). 화자와 학생은 연결하지 않는다.
  useEffect(() => {
    let alive = true;
    if (!rec) { setCands([]); return; }
    const t = new Date(rec.time).getTime();
    const near = tIndex.filter((m) => m.class === rec.class && t >= new Date(m.startedAt).getTime() - 120_000 && t <= new Date(m.endedAt).getTime() + 120_000);
    if (!near.length) { setCands([]); return; }
    const win = (doc.settings.recording || DEFAULT_RECORDING).alignWindowSec || [-60, 15];
    Promise.all(near.map((m) => tGet(m.id))).then((trs) => {
      if (!alive) return;
      setCands(alignCandidates(rec, trs.filter((x): x is Transcript => !!x), catLabel(doc, cat), win as [number, number], 4));
    });
    return () => { alive = false; };
  }, [rec?.id, cat, tIndex.length]);

  if (!rec) return null;
  const close = () => openSupplement([]);
  const advance = () => { if (idx + 1 < ids.length) setIdx(idx + 1); else { close(); toast({ text: `보완 완료 · ${ids.length}건` }); } };
  const save = () => { updateRecord(rec.id, { note: note.trim(), category: cat, status: "confirmed", lesson: rec.lesson }); advance(); };
  const skip = () => { updateRecord(rec.id, { status: "skipped", category: cat, lesson: rec.lesson }); advance(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    if (e.key === "Enter" && !e.shiftKey && note.trim()) { e.preventDefault(); save(); }
  };
  const memo = rec.memo || rec.voiceMemo?.transcript || "";

  return (
    <Modal onClose={close} header={
      <div className="supp-head">
        <span className="chip outline">{idx + 1} / {ids.length}</span>
        <span>{rec.class} · {rec.no}번 · {studentName(doc, rec.class, rec.no)}</span>
        <Chip cat={cat} label={catLabel(doc, cat)} />
        <span className="muted">{lessonLabel(rec.lesson) || "진도 미등록"}</span>
        <span className="muted small">{fmtMD(rec.time)} {fmtHM(rec.time)} · {rec.source === "watch" ? "워치" : rec.source === "widget" ? "위젯" : rec.source === "phone" ? "폰" : "PC"}</span>
      </div>
    } footer={
      <>
        <button className="btn ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><Icon name="left" />이전</button>
        <button className="btn ghost" disabled={idx + 1 >= ids.length} onClick={() => setIdx(idx + 1)}>다음<Icon name="right" /></button>
        <span className="grow" />
        <span className="muted small"><span className="kbd">Enter</span> 저장 · <span className="kbd">Esc</span> 닫기</span>
        <button className="btn" onClick={skip}>건너뛰기</button>
        <button className="btn primary" onClick={save}>저장</button>
      </>
    }>
      <div className="col" style={{ gap: 12 }}>
        <div className="flex wrap">
          {doc.settings.categories.map((c) => <Chip key={c.key} cat={c.key} label={c.label} selected={cat === c.key} onClick={() => setCat(c.key)} />)}
        </div>
        {memo && <div className="supp-memo">{rec.voiceMemo ? <><Icon name="mic" size={12} /> 음성 </> : "메모 "}<b>{memo}</b></div>}
        <textarea ref={ref} rows={3} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onKey} placeholder="관찰 내용 (예: 온도와 평형 이동을 르샤틀리에 원리와 연결)" />
        {cands.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <div className="small muted">수업 스크립트 후보 · 기록 시각 전후 발언 (눌러서 넣기)</div>
            <div className="supp-cands">
              {cands.map((c) => <button key={c.transcriptId + c.segment.id} className="supp-cand" onClick={() => { setNote(c.segment.text); ref.current?.focus(); }}><span className="meta">{String(c.at.getHours()).padStart(2, "0")}:{String(c.at.getMinutes()).padStart(2, "0")}:{String(c.at.getSeconds()).padStart(2, "0")} · {c.segment.speaker} · {c.reason}</span>{c.segment.text}</button>)}
            </div>
          </div>
        )}
        <div className="recs">
          {suggestions(cat, rec.lesson?.title || "", memo).map((s) => <button key={s} onClick={() => { setNote(s); ref.current?.focus(); }}>{s}</button>)}
        </div>
      </div>
    </Modal>
  );
}
