import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = "home" | "trainer" | "stats" | "profile";
type Difficulty = "easy" | "medium" | "hard";
type TrainerType = "arithmetic" | "algebra" | "geometry";

interface Task {
  question: string;
  answer: number;
  hint?: string;
}

interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  condition: (stats: Stats) => boolean;
}

interface Badge extends BadgeDef {
  earned: boolean;
}

interface Stats {
  total: number;
  correct: number;
  streak: number;
  maxStreak: number;
  byType: Record<TrainerType, { total: number; correct: number }>;
  byDifficulty: Record<Difficulty, { total: number; correct: number }>;
  history: { question: string; correct: boolean; ts: number }[];
}

// ─── Task generators ─────────────────────────────────────────────────────────

function r(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function genArithmetic(diff: Difficulty): Task {
  if (diff === "easy") {
    const op = ["+", "-"][r(0, 1)];
    const a = r(1, 20), b = r(1, 20);
    return { question: `${a} ${op} ${b} = ?`, answer: op === "+" ? a + b : a - b };
  }
  if (diff === "medium") {
    const ops = ["+", "-", "×", "÷"];
    const op = ops[r(0, 3)];
    if (op === "×") { const a = r(2, 12), b = r(2, 12); return { question: `${a} × ${b} = ?`, answer: a * b }; }
    if (op === "÷") { const b = r(2, 12), a = b * r(2, 9); return { question: `${a} ÷ ${b} = ?`, answer: a / b }; }
    const a = r(10, 99), b = r(10, 99);
    return { question: `${a} ${op} ${b} = ?`, answer: op === "+" ? a + b : a - b };
  }
  const a = r(100, 999), b = r(100, 999);
  const op = ["+", "-"][r(0, 1)];
  return { question: `${a} ${op} ${b} = ?`, answer: op === "+" ? a + b : a - b };
}

function genAlgebra(diff: Difficulty): Task {
  if (diff === "easy") {
    const x = r(1, 10), b = r(1, 10);
    return { question: `x + ${b} = ${x + b}`, answer: x, hint: "Перенеси число в правую часть" };
  }
  if (diff === "medium") {
    const x = r(1, 10), a = r(2, 5), b = r(1, 20);
    return { question: `${a}x + ${b} = ${a * x + b}`, answer: x, hint: "Сначала перенеси слагаемое, потом раздели" };
  }
  const x = r(1, 8), a = r(2, 5), b = r(1, 10), c = r(1, 3);
  return { question: `${a}x + ${b} = ${c}x + ${(a - c) * x + b}`, answer: x, hint: "Собери иксы в одну сторону" };
}

function genGeometry(diff: Difficulty): Task {
  if (diff === "easy") {
    const a = r(2, 15);
    return { question: `Периметр квадрата со стороной ${a}?`, answer: 4 * a, hint: "P = 4 × a" };
  }
  if (diff === "medium") {
    const a = r(3, 12), b = r(3, 12);
    if (r(0, 1) === 0) return { question: `Площадь прямоугольника ${a} × ${b}?`, answer: a * b, hint: "S = a × b" };
    return { question: `Периметр прямоугольника ${a} × ${b}?`, answer: 2 * (a + b), hint: "P = 2(a + b)" };
  }
  const rr = r(2, 10);
  if (r(0, 1) === 0) return { question: `Площадь круга r=${rr}? (π ≈ 3)`, answer: 3 * rr * rr, hint: "S = π × r²" };
  const base = r(4, 14), h = r(2, 8);
  return { question: `Площадь треугольника: a=${base}, h=${h}?`, answer: Math.round((base * h) / 2), hint: "S = (a × h) / 2" };
}

function generateTask(type: TrainerType, difficulty: Difficulty): Task {
  if (type === "arithmetic") return genArithmetic(difficulty);
  if (type === "algebra") return genAlgebra(difficulty);
  return genGeometry(difficulty);
}

// ─── Badges ───────────────────────────────────────────────────────────────────

const BADGE_DEFS: BadgeDef[] = [
  { id: "first", name: "Первый шаг", desc: "Решить первую задачу", icon: "🎯", condition: (s) => s.total >= 1 },
  { id: "ten", name: "Десятка", desc: "10 задач", icon: "🔟", condition: (s) => s.total >= 10 },
  { id: "fifty", name: "Полтинник", desc: "50 задач", icon: "💯", condition: (s) => s.total >= 50 },
  { id: "streak5", name: "Серия ×5", desc: "5 верных подряд", icon: "🔥", condition: (s) => s.maxStreak >= 5 },
  { id: "streak10", name: "Серия ×10", desc: "10 верных подряд", icon: "⚡", condition: (s) => s.maxStreak >= 10 },
  { id: "accuracy", name: "Снайпер", desc: "90% точности (≥20 задач)", icon: "🎖️", condition: (s) => s.total >= 20 && s.correct / s.total >= 0.9 },
  { id: "algebra", name: "Алгебраист", desc: "10 задач по алгебре", icon: "📐", condition: (s) => s.byType.algebra.total >= 10 },
  { id: "geom", name: "Геометр", desc: "10 задач по геометрии", icon: "📏", condition: (s) => s.byType.geometry.total >= 10 },
  { id: "hard5", name: "Сложняк", desc: "5 сложных задач", icon: "💎", condition: (s) => s.byDifficulty.hard.total >= 5 },
];

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATS: Stats = {
  total: 0, correct: 0, streak: 0, maxStreak: 0,
  byType: { arithmetic: { total: 0, correct: 0 }, algebra: { total: 0, correct: 0 }, geometry: { total: 0, correct: 0 } },
  byDifficulty: { easy: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, hard: { total: 0, correct: 0 } },
  history: [],
};

const TYPE_LABELS: Record<TrainerType, string> = { arithmetic: "Арифметика", algebra: "Алгебра", geometry: "Геометрия" };
const DIFF_LABELS: Record<Difficulty, string> = { easy: "Лёгкий", medium: "Средний", hard: "Сложный" };

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-[hsl(var(--border))] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500 bg-[hsl(var(--foreground))]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function NavBar({ section, setSection }: { section: Section; setSection: (s: Section) => void }) {
  const items = [
    { id: "home" as Section, icon: "Home", label: "Главная" },
    { id: "trainer" as Section, icon: "Brain", label: "Тренажёр" },
    { id: "stats" as Section, icon: "BarChart3", label: "Прогресс" },
    { id: "profile" as Section, icon: "User", label: "Профиль" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[hsl(var(--border))]">
      <div className="max-w-lg mx-auto flex">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors ${
              section === item.id ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"
            }`}
          >
            {section === item.id && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[hsl(var(--foreground))] rounded-full" />
            )}
            <Icon name={item.icon} size={20} />
            <span className="text-[11px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────

function HomeSection({ stats, setSection, setTrainerConfig }: {
  stats: Stats;
  setSection: (s: Section) => void;
  setTrainerConfig: (t: TrainerType, d: Difficulty) => void;
}) {
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const badges: Badge[] = BADGE_DEFS.map((b) => ({ ...b, earned: b.condition(stats) }));
  const earnedCount = badges.filter((b) => b.earned).length;

  const quickStart = (type: TrainerType, diff: Difficulty) => {
    setTrainerConfig(type, diff);
    setSection("trainer");
  };

  const trainers: { type: TrainerType; icon: string }[] = [
    { type: "arithmetic", icon: "Calculator" },
    { type: "algebra", icon: "Sigma" },
    { type: "geometry", icon: "Triangle" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="pt-2">
        <p className="text-xs font-mono text-[hsl(var(--muted-foreground))] uppercase tracking-widest mb-2">Математический тренажёр</p>
        <h1 className="font-golos font-black text-4xl leading-tight text-[hsl(var(--foreground))]">
          Реши задачу.<br />Стань лучше.
        </h1>
      </div>

      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Задач решено", val: stats.total, icon: "CheckCircle2" },
            { label: "Точность", val: `${accuracy}%`, icon: "Target" },
            { label: "Макс. серия", val: stats.maxStreak, icon: "Zap" },
          ].map((item) => (
            <div key={item.label} className="bg-white border border-[hsl(var(--border))] rounded-xl p-3 text-center">
              <Icon name={item.icon} size={16} className="mx-auto mb-1 text-[hsl(var(--muted-foreground))]" />
              <div className="font-mono font-semibold text-lg text-[hsl(var(--foreground))]">{item.val}</div>
              <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-tight">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">Быстрый старт</h2>
        <div className="space-y-2">
          {trainers.map((t) => (
            <div key={t.type} className="bg-white border border-[hsl(var(--border))] rounded-xl p-4 flex items-center justify-between hover:border-[hsl(var(--foreground))] transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-center">
                  <Icon name={t.icon} size={20} />
                </div>
                <div>
                  <div className="font-golos font-semibold text-[hsl(var(--foreground))]">{TYPE_LABELS[t.type]}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {stats.byType[t.type].total > 0 ? `${stats.byType[t.type].total} задач` : "Ещё не начато"}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => quickStart(t.type, d)}
                    className="w-8 h-8 text-xs font-mono font-semibold border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--foreground))] hover:text-white hover:border-transparent transition-all"
                  >
                    {d === "easy" ? "Л" : d === "medium" ? "С" : "Т"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Достижения</h2>
          <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{earnedCount}/{BADGE_DEFS.length}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {badges.slice(0, 6).map((b) => (
            <div key={b.id} className={`border rounded-xl p-3 text-center transition-all ${b.earned ? "border-[hsl(var(--foreground))] bg-white" : "border-[hsl(var(--border))] bg-[hsl(var(--secondary))] opacity-40"}`}>
              <div className="text-2xl mb-1">{b.icon}</div>
              <div className="text-[10px] font-golos font-semibold text-[hsl(var(--foreground))] leading-tight">{b.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Trainer ──────────────────────────────────────────────────────────────────

const TIMER_SECONDS: Record<Difficulty, number> = { easy: 30, medium: 45, hard: 60 };

function TimerRing({ seconds, max, urgent }: { seconds: number; max: number; urgent: boolean }) {
  const size = 56;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const progress = seconds / max;
  const dash = circ * progress;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={urgent ? "#ef4444" : seconds <= max * 0.4 ? "#f59e0b" : "hsl(var(--foreground))"}
          strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <span className={`absolute font-mono font-bold text-sm ${urgent ? "text-red-500" : seconds <= max * 0.4 ? "text-amber-500" : "text-[hsl(var(--foreground))]"}`}>
        {seconds}
      </span>
    </div>
  );
}

function TrainerSection({ initialType, initialDiff, onAnswer }: {
  initialType: TrainerType;
  initialDiff: Difficulty;
  onAnswer: (type: TrainerType, diff: Difficulty, correct: boolean, question: string) => void;
}) {
  const [trainerType, setTrainerType] = useState<TrainerType>(initialType);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDiff);
  const [task, setTask] = useState<Task>(() => generateTask(initialType, initialDiff));
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong" | "timeout">("idle");
  const [showHint, setShowHint] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS[initialDiff]);
  const [timerActive, setTimerActive] = useState(true);

  const maxTime = TIMER_SECONDS[difficulty];
  const urgent = timeLeft <= 8 && timerActive && feedback === "idle";

  const nextTask = useCallback((type: TrainerType, diff: Difficulty) => {
    setTask(generateTask(type, diff));
    setInput("");
    setFeedback("idle");
    setShowHint(false);
    setAnimKey((k) => k + 1);
    setTimeLeft(TIMER_SECONDS[diff]);
    setTimerActive(true);
  }, []);

  useEffect(() => { nextTask(trainerType, difficulty); }, [trainerType, difficulty]);

  useEffect(() => {
    if (!timerActive || feedback !== "idle") return;
    if (timeLeft <= 0) {
      setFeedback("timeout");
      setTimerActive(false);
      onAnswer(trainerType, difficulty, false, task.question);
      setSessionTotal((t) => t + 1);
      setStreak(0);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, timerActive, feedback, trainerType, difficulty, task.question, onAnswer]);

  const submit = () => {
    const val = parseFloat(input.replace(",", "."));
    if (isNaN(val)) return;
    setTimerActive(false);
    const correct = Math.abs(val - task.answer) < 0.01;
    setFeedback(correct ? "correct" : "wrong");
    onAnswer(trainerType, difficulty, correct, task.question);
    setSessionTotal((t) => t + 1);
    if (correct) {
      setSessionCorrect((c) => c + 1);
      setStreak((s) => s + 1);
      setTimeout(() => nextTask(trainerType, difficulty), 1000);
    } else {
      setStreak(0);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-2">
        <div className="flex gap-1.5">
          {(["arithmetic", "algebra", "geometry"] as TrainerType[]).map((t) => (
            <button key={t} onClick={() => setTrainerType(t)}
              className={`flex-1 py-2 text-xs font-mono font-semibold rounded-lg border transition-all ${trainerType === t ? "bg-[hsl(var(--foreground))] text-white border-transparent" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"}`}>
              {TYPE_LABELS[t].slice(0, 5)}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button key={d} onClick={() => setDifficulty(d)}
              className={`flex-1 py-2 text-xs font-mono font-semibold rounded-lg border transition-all ${difficulty === d ? "bg-[hsl(var(--foreground))] text-white border-transparent" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"}`}>
              {DIFF_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between h-14">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
            <Icon name="CheckCircle2" size={14} />
            <span className="font-mono">{sessionCorrect}/{sessionTotal}</span>
          </div>
          {streak > 1 && (
            <div className="flex items-center gap-1 text-sm font-mono font-bold text-orange-500 animate-scale-in">
              🔥 ×{streak}
            </div>
          )}
        </div>
        <TimerRing seconds={timeLeft} max={maxTime} urgent={urgent} />
      </div>

      <div key={animKey} className={`bg-white border-2 rounded-2xl p-8 text-center transition-all duration-200 animate-scale-in ${
        feedback === "correct" ? "border-green-400"
        : feedback === "wrong" || feedback === "timeout" ? "border-red-400"
        : urgent ? "border-red-200"
        : "border-[hsl(var(--border))]"
      }`}>
        <p className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] uppercase tracking-widest mb-4">
          {TYPE_LABELS[trainerType]} · {DIFF_LABELS[difficulty]}
        </p>
        <p className={`font-golos font-bold text-3xl leading-tight transition-colors ${urgent ? "text-red-500" : "text-[hsl(var(--foreground))]"}`}>
          {task.question}
        </p>

        {feedback === "correct" && (
          <div className="mt-5 flex items-center justify-center gap-2 text-green-600 font-golos font-semibold text-lg animate-scale-in">
            ✓ Верно!
          </div>
        )}
        {feedback === "wrong" && (
          <div className="mt-5 animate-fade-in">
            <div className="flex items-center justify-center gap-2 text-red-500 font-golos font-semibold">✗ Неверно</div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Ответ: <span className="font-mono font-bold text-[hsl(var(--foreground))]">{task.answer}</span>
            </p>
          </div>
        )}
        {feedback === "timeout" && (
          <div className="mt-5 animate-fade-in">
            <div className="flex items-center justify-center gap-2 text-red-500 font-golos font-semibold">⏰ Время вышло!</div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Ответ: <span className="font-mono font-bold text-[hsl(var(--foreground))]">{task.answer}</span>
            </p>
          </div>
        )}
      </div>

      {feedback === "idle" && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex gap-2">
            <input
              type="number"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Твой ответ..."
              className={`flex-1 h-14 px-4 font-mono text-xl text-center rounded-xl border-2 outline-none bg-white transition-colors ${urgent ? "border-red-300 focus:border-red-500" : "border-[hsl(var(--border))] focus:border-[hsl(var(--foreground))]"}`}
              autoFocus
            />
            <button
              onClick={submit}
              disabled={!input}
              className="w-14 h-14 bg-[hsl(var(--foreground))] text-white rounded-xl font-bold text-xl disabled:opacity-30 transition-all hover:opacity-80 active:scale-95"
            >
              →
            </button>
          </div>
          <div className="flex gap-2">
            {task.hint && (
              <button onClick={() => setShowHint(!showHint)}
                className="flex-1 h-10 text-sm font-golos text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] rounded-lg hover:border-[hsl(var(--foreground))] transition-all flex items-center justify-center gap-1.5">
                <Icon name="Lightbulb" size={14} /> Подсказка
              </button>
            )}
            <button onClick={() => nextTask(trainerType, difficulty)}
              className="flex-1 h-10 text-sm font-golos text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] rounded-lg hover:border-[hsl(var(--foreground))] transition-all">
              Пропустить
            </button>
          </div>
          {showHint && task.hint && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 animate-fade-in">
              💡 {task.hint}
            </div>
          )}
        </div>
      )}

      {(feedback === "wrong" || feedback === "timeout") && (
        <button onClick={() => nextTask(trainerType, difficulty)}
          className="w-full h-12 bg-[hsl(var(--foreground))] text-white font-golos font-semibold rounded-xl hover:opacity-80 transition-all animate-fade-in">
          Следующая задача →
        </button>
      )}
    </div>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function StatsSection({ stats }: { stats: Stats }) {
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const badges: Badge[] = BADGE_DEFS.map((b) => ({ ...b, earned: b.condition(stats) }));
  const weakest = (Object.entries(stats.byType) as [TrainerType, { total: number; correct: number }][])
    .filter(([, v]) => v.total > 0)
    .map(([k, v]) => ({ k, acc: v.correct / v.total }))
    .sort((a, b) => a.acc - b.acc)[0];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <p className="text-xs font-mono text-[hsl(var(--muted-foreground))] uppercase tracking-widest mb-1">Статистика</p>
        <h2 className="font-golos font-black text-3xl text-[hsl(var(--foreground))]">Твой прогресс</h2>
      </div>

      {stats.total === 0 ? (
        <div className="text-center py-20 text-[hsl(var(--muted-foreground))]">
          <div className="text-5xl mb-4">📊</div>
          <p className="font-golos">Реши несколько задач,<br />чтобы увидеть статистику</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Всего задач", val: stats.total, icon: "Hash" },
              { label: "Правильных", val: stats.correct, icon: "CheckCircle2" },
              { label: "Точность", val: `${accuracy}%`, icon: "Target" },
              { label: "Макс. серия", val: stats.maxStreak, icon: "Zap" },
            ].map((m) => (
              <div key={m.label} className="bg-white border border-[hsl(var(--border))] rounded-xl p-4">
                <Icon name={m.icon} size={18} className="text-[hsl(var(--muted-foreground))] mb-2" />
                <div className="font-mono font-bold text-2xl text-[hsl(var(--foreground))]">{m.val}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>

          {weakest && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="TrendingDown" size={16} className="text-amber-600" />
                <span className="font-golos font-semibold text-sm text-amber-800">Слабое место</span>
              </div>
              <p className="text-sm text-amber-700">
                {TYPE_LABELS[weakest.k]} — точность <span className="font-mono font-bold">{Math.round(weakest.acc * 100)}%</span>
              </p>
            </div>
          )}

          <div>
            <h3 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">По разделам</h3>
            <div className="space-y-3">
              {(Object.entries(stats.byType) as [TrainerType, { total: number; correct: number }][]).map(([type, data]) => (
                <div key={type} className="bg-white border border-[hsl(var(--border))] rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-golos font-medium text-sm text-[hsl(var(--foreground))]">{TYPE_LABELS[type]}</span>
                    <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {data.correct}/{data.total}{data.total > 0 ? ` · ${Math.round(data.correct / data.total * 100)}%` : ""}
                    </span>
                  </div>
                  <ProgressBar value={data.correct} max={data.total || 1} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">По сложности</h3>
            <div className="space-y-2">
              {(Object.entries(stats.byDifficulty) as [Difficulty, { total: number; correct: number }][]).map(([diff, data]) => (
                <div key={diff} className="flex items-center gap-3">
                  <span className="font-golos text-sm text-[hsl(var(--muted-foreground))] w-20">{DIFF_LABELS[diff]}</span>
                  <div className="flex-1"><ProgressBar value={data.correct} max={Math.max(data.total, 1)} /></div>
                  <span className="font-mono text-xs text-[hsl(var(--muted-foreground))] w-6 text-right">{data.total}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Достижения</h3>
              <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{badges.filter(b => b.earned).length}/{BADGE_DEFS.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {badges.map((b) => (
                <div key={b.id} className={`border rounded-xl p-3 text-center transition-all ${b.earned ? "border-[hsl(var(--foreground))] bg-white" : "border-[hsl(var(--border))] bg-[hsl(var(--secondary))] opacity-40"}`}>
                  <div className="text-2xl mb-1">{b.icon}</div>
                  <div className="text-[10px] font-golos font-semibold text-[hsl(var(--foreground))]">{b.name}</div>
                  <div className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5">{b.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {stats.history.length > 0 && (
            <div>
              <h3 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">Последние ответы</h3>
              <div className="space-y-1">
                {stats.history.slice(-10).reverse().map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-[hsl(var(--border))] last:border-0">
                    <span className={`text-sm font-mono ${h.correct ? "text-green-500" : "text-red-400"}`}>{h.correct ? "✓" : "✗"}</span>
                    <span className="font-mono text-sm text-[hsl(var(--foreground))] flex-1 truncate">{h.question}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function ProfileSection({ stats, onReset, name, setName }: {
  stats: Stats; onReset: () => void; name: string; setName: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [showConfirm, setShowConfirm] = useState(false);
  const [preferredType, setPreferredType] = useState<TrainerType>("arithmetic");
  const [preferredDiff, setPreferredDiff] = useState<Difficulty>("medium");
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-mono text-[hsl(var(--muted-foreground))] uppercase tracking-widest mb-1">Профиль</p>
        <h2 className="font-golos font-black text-3xl text-[hsl(var(--foreground))]">Настройки</h2>
      </div>

      <div className="bg-white border border-[hsl(var(--border))] rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-golos font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Имя</span>
          <button onClick={() => setEditing(!editing)} className="text-xs font-mono text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            {editing ? "Отмена" : "Изменить"}
          </button>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <input value={tempName} onChange={(e) => setTempName(e.target.value)}
              className="flex-1 h-10 px-3 font-golos border border-[hsl(var(--border))] rounded-lg focus:border-[hsl(var(--foreground))] outline-none text-[hsl(var(--foreground))]"
              autoFocus />
            <button onClick={() => { setName(tempName); setEditing(false); }}
              className="px-4 h-10 bg-[hsl(var(--foreground))] text-white rounded-lg text-sm font-golos font-semibold">
              Сохранить
            </button>
          </div>
        ) : (
          <p className="font-golos font-semibold text-lg text-[hsl(var(--foreground))]">{name || "Не указано"}</p>
        )}
      </div>

      <div className="bg-white border border-[hsl(var(--border))] rounded-xl p-4 space-y-4">
        <h3 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Предпочтения</h3>
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Раздел по умолчанию</p>
          <div className="flex gap-1.5">
            {(["arithmetic", "algebra", "geometry"] as TrainerType[]).map((t) => (
              <button key={t} onClick={() => setPreferredType(t)}
                className={`flex-1 py-2 text-xs font-mono font-semibold rounded-lg border transition-all ${preferredType === t ? "bg-[hsl(var(--foreground))] text-white border-transparent" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"}`}>
                {TYPE_LABELS[t].slice(0, 4)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Уровень сложности</p>
          <div className="flex gap-1.5">
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button key={d} onClick={() => setPreferredDiff(d)}
                className={`flex-1 py-2 text-xs font-mono font-semibold rounded-lg border transition-all ${preferredDiff === d ? "bg-[hsl(var(--foreground))] text-white border-transparent" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"}`}>
                {DIFF_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {stats.total > 0 && (
        <div className="bg-white border border-[hsl(var(--border))] rounded-xl p-4">
          <h3 className="font-golos font-semibold text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">Сводка</h3>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["Задач", stats.total], ["Точность", `${accuracy}%`], ["Серия", stats.maxStreak], ["Ошибок", stats.total - stats.correct]].map(([l, v]) => (
              <div key={l as string}>
                <div className="font-mono font-bold text-xl text-[hsl(var(--foreground))]">{v}</div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-red-100 rounded-xl p-4">
        <h3 className="font-golos font-semibold text-xs text-red-400 uppercase tracking-wider mb-2">Сброс данных</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">Вся статистика и достижения будут удалены. Это нельзя отменить.</p>
        {!showConfirm ? (
          <button onClick={() => setShowConfirm(true)}
            className="w-full h-10 border border-red-200 text-red-400 text-sm font-golos font-medium rounded-lg hover:bg-red-50 transition-all">
            Сбросить прогресс
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { onReset(); setShowConfirm(false); }}
              className="flex-1 h-10 bg-red-400 text-white text-sm font-golos font-semibold rounded-lg">
              Да, сбросить
            </button>
            <button onClick={() => setShowConfirm(false)}
              className="flex-1 h-10 border border-[hsl(var(--border))] text-sm font-golos text-[hsl(var(--foreground))] rounded-lg">
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const STATS_KEY = "mathtrainer_stats";
const NAME_KEY = "mathtrainer_name";

export default function Index() {
  const [section, setSection] = useState<Section>("home");
  const [trainerType, setTrainerType] = useState<TrainerType>("arithmetic");
  const [trainerDiff, setTrainerDiff] = useState<Difficulty>("medium");
  const [name, setNameState] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [stats, setStats] = useState<Stats>(() => {
    try { const s = localStorage.getItem(STATS_KEY); return s ? JSON.parse(s) : INITIAL_STATS; }
    catch { return INITIAL_STATS; }
  });

  const setName = (n: string) => { setNameState(n); localStorage.setItem(NAME_KEY, n); };

  const handleAnswer = (type: TrainerType, diff: Difficulty, correct: boolean, question: string) => {
    setStats((prev) => {
      const newStreak = correct ? prev.streak + 1 : 0;
      const updated: Stats = {
        ...prev,
        total: prev.total + 1,
        correct: prev.correct + (correct ? 1 : 0),
        streak: newStreak,
        maxStreak: Math.max(prev.maxStreak, newStreak),
        byType: { ...prev.byType, [type]: { total: prev.byType[type].total + 1, correct: prev.byType[type].correct + (correct ? 1 : 0) } },
        byDifficulty: { ...prev.byDifficulty, [diff]: { total: prev.byDifficulty[diff].total + 1, correct: prev.byDifficulty[diff].correct + (correct ? 1 : 0) } },
        history: [...prev.history, { question, correct, ts: Date.now() }].slice(-50),
      };
      localStorage.setItem(STATS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const setTrainerConfig = (t: TrainerType, d: Difficulty) => { setTrainerType(t); setTrainerDiff(d); };
  const resetStats = () => { setStats(INITIAL_STATS); localStorage.setItem(STATS_KEY, JSON.stringify(INITIAL_STATS)); };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] font-golos relative overflow-x-hidden">
      {/* Декоративный фон */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <svg className="absolute top-0 right-0 w-80 h-80 opacity-[0.035]" viewBox="0 0 320 320" fill="none">
          <circle cx="260" cy="60" r="140" stroke="#111" strokeWidth="1.5"/>
          <circle cx="260" cy="60" r="100" stroke="#111" strokeWidth="1"/>
          <circle cx="260" cy="60" r="60" stroke="#111" strokeWidth="0.8"/>
        </svg>
        <svg className="absolute bottom-24 left-0 w-64 h-64 opacity-[0.03]" viewBox="0 0 256 256" fill="none">
          <rect x="20" y="20" width="100" height="100" stroke="#111" strokeWidth="1.2" transform="rotate(15 70 70)"/>
          <rect x="50" y="50" width="60" height="60" stroke="#111" strokeWidth="0.8" transform="rotate(15 80 80)"/>
          <rect x="80" y="80" width="30" height="30" stroke="#111" strokeWidth="0.6" transform="rotate(15 95 95)"/>
        </svg>
        <svg className="absolute top-1/3 left-4 w-48 h-48 opacity-[0.025]" viewBox="0 0 192 192" fill="none">
          <polygon points="96,10 182,182 10,182" stroke="#111" strokeWidth="1.2"/>
          <polygon points="96,40 162,162 30,162" stroke="#111" strokeWidth="0.8"/>
          <polygon points="96,70 142,142 50,142" stroke="#111" strokeWidth="0.5"/>
        </svg>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-black/8 to-transparent"/>
      </div>
      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8 pb-28">
        {section === "home" && <HomeSection stats={stats} setSection={setSection} setTrainerConfig={setTrainerConfig} />}
        {section === "trainer" && (
          <TrainerSection key={`${trainerType}-${trainerDiff}`} initialType={trainerType} initialDiff={trainerDiff} onAnswer={handleAnswer} />
        )}
        {section === "stats" && <StatsSection stats={stats} />}
        {section === "profile" && <ProfileSection stats={stats} onReset={resetStats} name={name} setName={setName} />}
      </div>
      <NavBar section={section} setSection={setSection} />
    </div>
  );
}