import { useEffect, useMemo, useState } from 'react';
import { Camera, Compass, Headphones, Luggage, Plane, Umbrella, RotateCcw, Check } from 'lucide-react';

import { itineraryQuestions, routeRounds } from '../../lib/journeyActivities';
import type { ItineraryDay, JourneyQuestion } from '../../lib/types';

const symbols = [Camera, Compass, Headphones, Luggage, Plane, Umbrella];
const names = ['相機', '指南針', '耳機', '行李箱', '飛機', '雨傘'];
function shuffle<T,>(input: T[]): T[] {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function deal() { return shuffle(Array.from({ length: 12 }, (_, i) => i % 6)); }

export function JourneyGame({ days }: { days: ItineraryDay[] }) {
  const questions = useMemo(() => itineraryQuestions(days), [days]);
  const rounds = useMemo(() => routeRounds(days), [days]);
  const [mode, setMode] = useState<'quiz' | 'route' | 'memory'>(() => days.some(day => day.quiz?.length) ? 'quiz' : 'memory');
  return <section className="journey-game" aria-label="旅途小遊戲">
    <header className="journey-section-heading"><div><h2>旅途小遊戲</h2><p>用這趟旅程的地點與時間出題，候車時也可以離線玩。</p></div></header>
    <nav className="game-picker" aria-label="選擇小遊戲">
      {([['quiz', '行程小測驗'], ['route', '行程排排看'], ['memory', '旅途翻翻卡']] as const).map(([id, label]) =>
        <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}
    </nav>
    {mode === 'quiz' && <TripQuiz key={JSON.stringify(questions)} questions={questions} />}
    {mode === 'route' && <RouteGame key={JSON.stringify(rounds.map(round => [round.date, round.stops.map(s => [s.name,s.time])]))} rounds={rounds} />}
    {mode === 'memory' && <MemoryGame />}
  </section>;
}

function TripQuiz({ questions }: { questions: JourneyQuestion[] }) {
  const makeDeck = () => shuffle(questions).slice(0, 10).map(q => ({ ...q, options: shuffle(q.options) }));
  const [deck, setDeck] = useState(makeDeck);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState('');
  const [score, setScore] = useState(0);
  if (!deck.length) return <p className="journey-empty-inline">加入有時間或地點的行程，就可以玩這趟旅程的小測驗。</p>;
  const current = deck[index];
  return <section className="trip-game-round" aria-label="行程小測驗">
    {current ? <>
      <p className="game-progress">第 {index + 1} / {deck.length} 題 · 答中 {score} 題</p>
      <h3>{current.question}</h3>
      <div className="game-choices">{current.options.map(option => <button type="button" key={option}
        disabled={!!choice} data-result={choice ? option === current.answer ? 'correct' : option === choice ? 'wrong' : undefined : undefined}
        onClick={() => { setChoice(option); if (option === current.answer) setScore(value => value + 1); }}>{option}</button>)}</div>
      {choice && <div className="game-answer" role="status"><strong>{choice === current.answer ? '答啱！' : '答案係「' + current.answer + '」'}</strong><p>行程記載 · {current.evidence}</p>
        <button type="button" className="primary" onClick={() => { setIndex(index + 1); setChoice(''); }}>{index + 1 < deck.length ? '下一題' : '查看成績'}</button></div>}
    </> : <div role="status"><h3>完成小測驗</h3><p>答中 {score} / {deck.length} 題</p><button type="button" className="secondary" onClick={() => { setDeck(makeDeck()); setIndex(0); setChoice(''); setScore(0); }}>再玩一次</button></div>}
  </section>;
}

function RouteGame({ rounds }: { rounds: ReturnType<typeof routeRounds> }) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [picked, setPicked] = useState(0);
  const [hint, setHint] = useState('');
  const round = rounds[roundIndex];
  const options = useMemo(() => round ? shuffle(round.stops) : [], [round]);
  if (!round) return <p className="journey-empty-inline">同一日至少有兩個不同時間、同一時區的地點，就可以排列當日路線。</p>;
  const done = picked === round.stops.length;
  return <section className="trip-game-round" aria-label="行程排排看">
    <p className="game-progress">{round.date} · {round.region} · {picked} / {round.stops.length} 站</p>
    <h3>由早到晚，依次揀出當日的站點</h3>
    <div className="game-choices">{options.map(spot => <button type="button" key={spot.name}
      disabled={round.stops.indexOf(spot) < picked} onClick={() => {
        if (spot !== round.stops[picked]) { setHint('這一站比較遲，再試一次。'); return; }
        setPicked(picked + 1); setHint(spot.time + ' · ' + spot.name);
      }}>{spot.name}</button>)}</div>
    <ol className="game-route-answer">{round.stops.slice(0, picked).map(s => <li key={s.name}><time>{s.time}</time> {s.name}</li>)}</ol>
    <p role="status">{done ? '全日路線排啱晒！' : hint}</p>
    {done && <button type="button" className="secondary" onClick={() => { setRoundIndex((roundIndex + 1) % rounds.length); setPicked(0); setHint(''); }}>{rounds.length === 1 ? '再玩一次' : '下一日'}</button>}
  </section>;
}

function MemoryGame() {
  const [cards, setCards] = useState(deal);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const same = cards[a] === cards[b];
    const timer = window.setTimeout(() => {
      if (same) setMatched(prev => [...prev, cards[a]]);
      setFlipped([]);
    }, same ? 220 : 850);
    return () => window.clearTimeout(timer);
  }, [flipped, cards]);
  return <section className="trip-game-round" aria-label="旅途翻翻卡">
    <h3>找出六對旅行用品</h3>
    <div className="journey-game-score" aria-live="polite"><strong>{matched.length === 6 ? '全部配對成功' : `配對 ${matched.length} / 6`}</strong><span>{moves} 步</span></div>
    <div className="journey-game-board">{cards.map((symbol, i) => {
      const Icon = symbols[symbol];
      const done = matched.includes(symbol);
      const open = done || flipped.includes(i);
      return <button key={i} type="button" className={`journey-game-card${open ? ' is-open' : ''}${done ? ' is-matched' : ''}`} aria-label={open ? `${names[symbol]}${done ? '，已配對' : ''}` : `翻開第 ${i + 1} 張卡`} disabled={done} onClick={() => {
        if (flipped.length >= 2 || open) return;
        if (flipped.length === 1) setMoves(value => value + 1);
        setFlipped(prev => [...prev, i]);
      }}>{open ? <><Icon size={32} strokeWidth={1.5} /><span>{names[symbol]}</span>{done && <Check size={14} className="journey-game-check" />}</> : <Compass size={28} strokeWidth={1.2} />}</button>;
    })}</div>
    <button type="button" className="secondary" onClick={() => { setCards(deal()); setFlipped([]); setMatched([]); setMoves(0); }}><RotateCcw size={16} /> 重新開始</button>
  </section>;
}
