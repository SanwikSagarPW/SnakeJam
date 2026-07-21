import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCcw, ChevronRight, Volume2, VolumeX, Heart, RotateCcw, Play, X, BookOpen } from 'lucide-react';
import { LEVELS, Worm, Point, Direction } from './levels';
import { generateProceduralLevel } from './generator';
import { sound } from './sound';
import { resolveProgress, saveProgress, sendAnalytics } from './bridge';
import type { } from './bridge';

const CELL_SIZE = 50;
const LINE_WIDTH = 14;
const GRID_W = 10;
const GRID_H = 10;
const SVG_W = GRID_W * CELL_SIZE;
const SVG_H = GRID_H * CELL_SIZE;
const SEGMENT_DISTANCE = 8; // Smaller distance for smoother tracing
const POINTS_PER_CELL = 6; 
const ENABLE_DEV_COMPLETE_SHORTCUT = false;

interface SnakePoint {
  x: number;
  y: number;
}

interface Snake {
  id: string;
  points: SnakePoint[];
  direction: Direction;
  state: 'idle' | 'flying' | 'bumping';
  gridCells: Point[]; // Current grid cells occupied (for collision)
  color: string;
}

function GridBackground() {
  const lines = [];
  for (let i = 0; i <= GRID_W; i++) {
    lines.push(
      <line
        key={`v-${i}`}
        x1={i * CELL_SIZE}
        y1={0}
        x2={i * CELL_SIZE}
        y2={SVG_H}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />
    );
  }
  for (let i = 0; i <= GRID_H; i++) {
    lines.push(
      <line
        key={`h-${i}`}
        x1={0}
        y1={i * CELL_SIZE}
        x2={SVG_W}
        y2={i * CELL_SIZE}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />
    );
  }
  return <g>{lines}</g>;
}

function generateProceduralPoints(cells: Point[]): SnakePoint[] {
  const points: SnakePoint[] = [];
  // We want points to be exactly SEGMENT_DISTANCE apart
  // First, let's get the full path as a set of line segments
  const path: SnakePoint[] = cells.map(c => ({
    x: c.x * CELL_SIZE + CELL_SIZE / 2,
    y: c.y * CELL_SIZE + CELL_SIZE / 2
  }));

  if (path.length === 0) return [];

  points.push(path[0]);
  let currentPos = path[0];
  let pathIdx = 1;

  while (pathIdx < path.length) {
    const target = path[pathIdx];
    const dx = target.x - currentPos.x;
    const dy = target.y - currentPos.y;
    const dist = Math.hypot(dx, dy);

    if (dist > SEGMENT_DISTANCE) {
      const angle = Math.atan2(dy, dx);
      currentPos = {
        x: currentPos.x + Math.cos(angle) * SEGMENT_DISTANCE,
        y: currentPos.y + Math.sin(angle) * SEGMENT_DISTANCE
      };
      points.push(currentPos);
    } else {
      currentPos = target;
      pathIdx++;
    }
  }
  
  // Ensure the last point is exactly at the head position if not already
  const lastPathPt = path[path.length - 1];
  if (Math.hypot(points[points.length - 1].x - lastPathPt.x, points[points.length - 1].y - lastPathPt.y) > 0.1) {
    points.push(lastPathPt);
  }

  return points;
}

function getSnakePath(points: SnakePoint[]) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function SnakeHead({ points, direction, color, isBumping }: { points: SnakePoint[], direction: Direction, color: string, isBumping: boolean }) {
  const head = points[points.length - 1];
  
  let angle = 0;
  if (direction === 'RIGHT') angle = 0;
  else if (direction === 'LEFT') angle = 180;
  else if (direction === 'UP') angle = -90;
  else if (direction === 'DOWN') angle = 90;
  
  const size = 20;
  const eyeSize = 2.5;
  const eyeOffset = 6;
  const eyeSpacing = 5;

  return (
    <g transform={`translate(${head.x}, ${head.y}) rotate(${angle})`}>
      {/* Head Shape - More of a classic arrow/snake head */}
      <path
        d={`M ${-size/1.5} ${-size/1.5} L ${size/1.2} 0 L ${-size/1.5} ${size/1.5} L ${-size/3} 0 Z`}
        fill={isBumping ? '#ef4444' : color}
        stroke={isBumping ? '#ef4444' : color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Eyes */}
      <circle cx={eyeOffset - 2} cy={-eyeSpacing} r={eyeSize} fill="white" />
      <circle cx={eyeOffset - 2} cy={eyeSpacing} r={eyeSize} fill="white" />
      <circle cx={eyeOffset - 1} cy={-eyeSpacing} r={eyeSize/2} fill="black" />
      <circle cx={eyeOffset - 1} cy={eyeSpacing} r={eyeSize/2} fill="black" />
    </g>
  );
}

function isBlocked(snake: Snake, allSnakes: Snake[]) {
  const dx = snake.direction === 'RIGHT' ? 1 : snake.direction === 'LEFT' ? -1 : 0;
  const dy = snake.direction === 'DOWN' ? 1 : snake.direction === 'UP' ? -1 : 0;

  const head = snake.gridCells[snake.gridCells.length - 1];
  
  let checkX = head.x + dx;
  let checkY = head.y + dy;
  
  while (checkX >= 0 && checkX < GRID_W && checkY >= 0 && checkY < GRID_H) {
    for (const other of allSnakes) {
      // Only block against IDLE snakes that are still part of the puzzle
      if (other.id === snake.id || other.state !== 'idle') continue;
      for (const cell of other.gridCells) {
        if (cell.x === checkX && cell.y === checkY) return true;
      }
    }
    checkX += dx;
    checkY += dy;
  }
  return false;
}

const HOW_TO_PLAY_STEPS = [
  { emoji: '👆', title: 'Tap a Snake', desc: "Click any snake to launch it in the direction it's pointing." },
  { emoji: '🚀', title: 'Clear the Board', desc: 'Each launched snake flies off the grid. Get them all out to win.' },
  { emoji: '🧠', title: 'Order Matters', desc: "A snake can't launch if another is blocking its path — plan ahead." },
  { emoji: '❤️', title: 'Watch Your Lives', desc: 'Tapping a blocked snake costs a life. Lose all 3 and it\'s game over.' },
];

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        className="relative z-10 w-full max-w-md bg-[#111827] border border-white/10 rounded-3xl p-6 shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 text-white/50 hover:text-white transition-all"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-xl font-bold text-white mb-1">How to Play</h2>
        <p className="text-white/40 text-sm mb-5">Master these 4 rules and you're set.</p>
        <div className="space-y-3">
          {HOW_TO_PLAY_STEPS.map(({ emoji, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className="flex items-start gap-4 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]"
            >
              <span className="text-2xl mt-0.5 flex-shrink-0">{emoji}</span>
              <div>
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-white/45 text-xs mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
          <span className="text-amber-400 text-sm mt-0.5">💡</span>
          <p className="text-amber-200/55 text-xs leading-relaxed">
            <span className="font-semibold text-amber-200/75">Tip:</span> Launch snakes with a clear path first — it opens up the board for the rest.
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-sm tracking-wide shadow-[0_4px_20px_rgba(99,102,241,0.35)]"
        >
          Got it!
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function HomeScreen({ onStart }: { onStart: () => void }) {
  const [showHTP, setShowHTP] = useState(false);

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center relative overflow-hidden">

      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      {/* Radial vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, #080c14 100%)' }} />
      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[320px] bg-indigo-600/12 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center text-center gap-7 px-6"
      >
        {/* Icon */}
        <motion.span
          className="text-5xl select-none"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          🐍
        </motion.span>

        {/* Title */}
        <div className="space-y-2">
          <h1
            className="text-6xl sm:text-7xl font-black tracking-tighter leading-none text-white"
            style={{ textShadow: '0 0 48px rgba(99,102,241,0.3)' }}
          >
            SNAKE<span className="bg-gradient-to-br from-indigo-400 to-purple-500 bg-clip-text text-transparent">JAM</span>
          </h1>
          <p className="text-white/30 text-xs font-medium tracking-[0.3em] uppercase">
            Puzzle · Strategy · Satisfying
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onStart}
            className="relative w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-base tracking-wide shadow-[0_8px_32px_rgba(99,102,241,0.4)] overflow-hidden"
          >
            <Play className="w-4 h-4 fill-white flex-shrink-0" />
            Play Now
            <motion.span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 pointer-events-none"
              initial={{ x: '-120%' }}
              animate={{ x: '220%' }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
            />
          </motion.button>

          <button
            onClick={() => setShowHTP(true)}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl border border-white/12 bg-white/[0.05] hover:bg-white/10 hover:border-white/20 text-white/55 hover:text-white/90 text-sm font-semibold transition-all"
          >
            <BookOpen className="w-4 h-4" />
            How to Play
          </button>
        </div>

        <p className="text-white/20 text-[11px] tracking-widest uppercase">3 lives · Endless levels</p>
      </motion.div>

      <AnimatePresence>
        {showHTP && <HowToPlayModal onClose={() => setShowHTP(false)} />}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [gameState, setGameState] = useState<'home' | 'playing'>('home');
  const [currentLevel, setCurrentLevel] = useState(0);
  const [snakes, setSnakes] = useState<Snake[]>([]);
  const [isLevelComplete, setIsLevelComplete] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [lives, setLives] = useState(3);
  const [isMuted, setIsMuted] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(0);
  // Progress bridge — resolved once on mount
  const progressRef = useRef(resolveProgress());

  const initLevel = useCallback((levelIdx: number) => {
    const levelData = generateProceduralLevel(levelIdx);
    const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4'];
    
    const newSnakes: Snake[] = levelData.map((w, i) => ({
      id: w.id,
      direction: w.direction,
      state: 'idle',
      gridCells: w.cells,
      points: generateProceduralPoints(w.cells),
      color: colors[i % colors.length]
    }));
    setSnakes(newSnakes);
    setIsLevelComplete(false);
    setIsGameOver(false);
    setLives(3);
  }, []);

  const restartGame = () => {
    setLives(3);
    setGameState('home');
  };

  useEffect(() => {
    if (gameState === 'playing') {
      sendAnalytics('level_start', currentLevel + 1);
    }
    initLevel(currentLevel);
  }, [currentLevel, initLevel, gameState]);

  const updatePhysics = useCallback((time: number) => {
    const deltaTime = Math.min(time - lastTimeRef.current, 32); // Cap delta time
    lastTimeRef.current = time;

    setSnakes(prevSnakes => {
      let changed = false;
      const nextSnakes = prevSnakes.map(snake => {
        if (snake.state === 'flying') {
          changed = true;
          const newPoints = [...snake.points];
          const headIdx = newPoints.length - 1;
          const head = newPoints[headIdx];
          const speed = 0.6 * deltaTime;
          
          const dx = snake.direction === 'RIGHT' ? 1 : snake.direction === 'LEFT' ? -1 : 0;
          const dy = snake.direction === 'DOWN' ? 1 : snake.direction === 'UP' ? -1 : 0;

          // 1. Calculate new head position
          const newHead = {
            x: head.x + dx * speed,
            y: head.y + dy * speed
          };

          // 2. Rigid "Train" Movement:
          // Instead of just pulling, we shift all points forward.
          // To maintain the exact path, we treat the points as a queue.
          // However, for a continuous movement, we can interpolate the shift.
          
          let remainingSpeed = speed;
          let currentHead = { ...head };
          
          while (remainingSpeed > 0) {
            const step = Math.min(remainingSpeed, 2); // Small steps for precision
            const nextHead = {
              x: currentHead.x + dx * step,
              y: currentHead.y + dy * step
            };
            
            // Shift all points: each point moves to where the one in front was
            // But we need to maintain the distance SEGMENT_DISTANCE.
            // A better way for "no skipping" is to store the path history.
            // But we can simulate it by moving the tail segments only when the head has moved enough.
            
            // Actually, the simplest "rigid" way is:
            // newPoints[i] = newPoints[i+1] - direction * SEGMENT_DISTANCE
            // but that only works for straight lines.
            
            // Let's use the "Distance Constraint" but with high precision (multiple iterations)
            // to ensure it follows the path exactly.
            newPoints[headIdx] = nextHead;
            for (let iter = 0; iter < 5; iter++) {
              for (let i = headIdx - 1; i >= 0; i--) {
                const anchor = newPoints[i + 1];
                const point = newPoints[i];
                const diffX = point.x - anchor.x;
                const diffY = point.y - anchor.y;
                const dist = Math.hypot(diffX, diffY);
                if (dist > SEGMENT_DISTANCE) {
                  const ratio = SEGMENT_DISTANCE / dist;
                  newPoints[i] = {
                    x: anchor.x + diffX * ratio,
                    y: anchor.y + diffY * ratio
                  };
                }
              }
            }
            
            currentHead = nextHead;
            remainingSpeed -= step;
          }

          // Check if completely off screen
          const isOffScreen = newPoints.every(p => 
            p.x < -200 || p.x > SVG_W + 200 || p.y < -200 || p.y > SVG_H + 200
          );
          if (isOffScreen) return null;

          return { ...snake, points: newPoints };
        }
        return snake;
      }).filter(Boolean) as Snake[];

      if (nextSnakes.length === 0 && prevSnakes.length > 0) {
        setIsLevelComplete(true);
        sound.playVictory();
        // Save progress and fire analytics
        setCurrentLevel(prev => {
          // Save prev+1 so next session starts at prev+1 (i.e. the next level)
          saveProgress(prev + 1, progressRef.current.payload);
          sendAnalytics('level_complete', prev + 1, {
            livesRemaining: lives,
            snakesCleared: prevSnakes.length,
          });
          // Refresh progressRef so restarts in the same session use the updated level
          progressRef.current = resolveProgress();
          return prev;
        });
      }

      return changed ? nextSnakes : prevSnakes;
    });

    requestRef.current = requestAnimationFrame(updatePhysics);
  }, [lives]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updatePhysics);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [updatePhysics]);

  useEffect(() => {
    const win = window as Window & { __completeLevelForTest?: () => void };
    win.__completeLevelForTest = () => {
      if (!ENABLE_DEV_COMPLETE_SHORTCUT) {
        console.log('DEV: Auto-complete ignored because debug shortcut is disabled.');
        return;
      }

      setIsLevelComplete(true);
      sendAnalytics('level_complete', currentLevel + 1, {
        livesRemaining: lives,
        snakesCleared: snakes.length,
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key && event.key.toLowerCase() === 'c') || event.code === 'KeyC') {
        event.preventDefault();
        win.__completeLevelForTest?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      delete win.__completeLevelForTest;
    };
  }, [currentLevel, lives, snakes.length]);

  const handleSnakeClick = (id: string) => {
    if (isGameOver || isLevelComplete) return;

    const snake = snakes.find(s => s.id === id);
    if (!snake || snake.state !== 'idle') return;

    if (isBlocked(snake, snakes)) {
      // Bumping animation
      sound.playBump();
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 300);
      
      setLives(l => {
        const next = l - 1;
        if (next <= 0) {
          setIsGameOver(true);
          sendAnalytics('game_over', currentLevel + 1);
        } else {
          sendAnalytics('level_fail', currentLevel + 1, { livesRemaining: next });
        }
        return next;
      });

      setSnakes(prev => prev.map(s => s.id === id ? { ...s, state: 'bumping' } : s));
      
      // Reset bumping state after a delay
      setTimeout(() => {
        setSnakes(prev => prev.map(s => s.state === 'bumping' ? { ...s, state: 'idle' } : s));
      }, 400);
    } else {
      sound.playSlither();
      setSnakes(prev => prev.map(s => s.id === id ? { ...s, state: 'flying' } : s));
    }
  };

  // ── Home Screen ──────────────────────────────────────────────────────────────
  if (gameState === 'home') {
    return (
      <HomeScreen
        onStart={() => {
          sound.playClick();
          // Re-resolve fresh each time so restarts always read latest localStorage
          progressRef.current = resolveProgress();
          const startIdx = progressRef.current.startLevelIndex;
          setCurrentLevel(startIdx);
          initLevel(startIdx);
          sendAnalytics('game_start', startIdx + 1, { source: progressRef.current.source });
          setGameState('playing');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center font-sans overflow-hidden relative">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-64 bg-indigo-600/15 rounded-full blur-[80px] pointer-events-none" />

      {/* Header */}
      <div className="w-full max-w-md px-4 pt-5 pb-3 sm:px-8 sm:pt-7 sm:pb-4 flex justify-between items-center z-10">
        <div className="flex flex-col">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter uppercase italic"
            style={{ textShadow: '0 0 20px rgba(99,102,241,0.5)' }}>
            Snake<span className="text-indigo-400">Jam</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex gap-0.5">
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={i === lives ? {
                    scale: [1, 1.5, 1],
                    rotate: [0, 15, -15, 0]
                  } : { scale: 1, rotate: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Heart
                    className={`w-3 h-3 sm:w-4 sm:h-4 ${i < lives ? 'fill-rose-400 text-rose-400' : 'text-white/20'}`}
                  />
                </motion.div>
              ))}
            </div>
            <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase ml-1">Lives</span>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Level</span>
            <span className="text-lg sm:text-xl font-black text-indigo-400 leading-none">{currentLevel + 1}</span>
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                const muted = sound.toggleMute();
                setIsMuted(muted);
              }}
              className="p-2 sm:p-3 bg-white/10 border border-white/20 rounded-xl sm:rounded-2xl hover:bg-white/20 hover:border-indigo-400 text-white/60 hover:text-white transition-all active:scale-90 backdrop-blur-sm"
              title="Toggle Mute"
            >
              {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button
              onClick={() => {
                sound.playClick();
                restartGame();
              }}
              className="p-2 sm:p-3 bg-white/10 border border-white/20 rounded-xl sm:rounded-2xl hover:bg-rose-500/20 hover:border-rose-400 text-white/60 hover:text-rose-400 transition-all active:scale-90 backdrop-blur-sm"
              title="Back to Home"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => {
                sound.playClick();
                initLevel(currentLevel);
              }}
              className="p-2 sm:p-3 bg-white/10 border border-white/20 rounded-xl sm:rounded-2xl hover:bg-indigo-500/20 hover:border-indigo-400 text-white/60 hover:text-indigo-400 transition-all active:scale-90 backdrop-blur-sm"
              title="Restart Level"
            >
              <RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex items-center justify-center w-full max-w-xl px-4 py-2 sm:px-6 relative">
        <motion.div
          animate={isShaking ? {
            x: [0, -10, 10, -10, 10, 0],
            y: [0, 5, -5, 5, -5, 0]
          } : { x: 0, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative w-full aspect-square"
        >
          {/* Board glow ring */}
          <div className="absolute inset-0 rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-sm" />

          <div className="relative w-full h-full p-4 sm:p-8 bg-slate-800/80 backdrop-blur-md rounded-[2rem] sm:rounded-[2.5rem] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-full overflow-visible touch-none"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            >
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Grid Lines */}
              <GridBackground />

              {/* Grid Dots */}
              {Array.from({ length: GRID_W }).map((_, x) =>
                Array.from({ length: GRID_H }).map((_, y) => (
                  <circle
                    key={`${x}-${y}`}
                    cx={x * CELL_SIZE + CELL_SIZE / 2}
                    cy={y * CELL_SIZE + CELL_SIZE / 2}
                    r={1.5}
                    fill="rgba(255,255,255,0.12)"
                  />
                ))
              )}

              {/* Snakes */}
              {snakes.map(snake => {
                const dx = snake.direction === 'RIGHT' ? 1 : snake.direction === 'LEFT' ? -1 : 0;
                const dy = snake.direction === 'DOWN' ? 1 : snake.direction === 'UP' ? -1 : 0;

                return (
                  <motion.g
                    key={snake.id}
                    initial={false}
                    animate={snake.state === 'bumping' ? {
                      x: [0, dx * 8, -dx * 4, dx * 2, 0],
                      y: [0, dy * 8, -dy * 4, dy * 2, 0],
                    } : { x: 0, y: 0 }}
                    transition={{ duration: 0.4 }}
                    onClick={() => handleSnakeClick(snake.id)}
                    className="cursor-pointer"
                  >
                    {/* Invisible hit area */}
                    <path
                      d={getSnakePath(snake.points)}
                      stroke="transparent"
                      strokeWidth={LINE_WIDTH * 3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />

                    {/* Snake Body Shadow */}
                    <path
                      d={getSnakePath(snake.points)}
                      stroke="rgba(0,0,0,0.3)"
                      strokeWidth={LINE_WIDTH + 4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      transform="translate(2, 4)"
                    />

                    {/* Snake Body Segments */}
                    <g style={{ filter: 'url(#glow)' }}>
                      {snake.points.map((p, i) => {
                        const t = i / snake.points.length;
                        const radius = (LINE_WIDTH / 2) * (0.6 + 0.4 * t);
                        return (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={radius}
                            fill={snake.state === 'bumping' ? '#ef4444' : snake.color}
                            className="transition-colors duration-200"
                          />
                        );
                      })}
                    </g>

                    {/* Snake Head */}
                    <SnakeHead
                      points={snake.points}
                      direction={snake.direction}
                      color={snake.color}
                      isBumping={snake.state === 'bumping'}
                    />
                  </motion.g>
                );
              })}
            </svg>

            {/* Level Complete Overlay */}
            <AnimatePresence>
              {isLevelComplete && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center rounded-[2rem] sm:rounded-[2.5rem]"
                >
                  <motion.div
                    initial={{ y: 20, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    className="text-center p-4"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.6 }}
                      className="text-5xl mb-4"
                    >
                      🎉
                    </motion.div>
                    <h2 className="text-4xl sm:text-5xl font-black text-white mb-2 tracking-tighter italic uppercase"
                      style={{ textShadow: '0 0 30px rgba(99,102,241,0.7)' }}>
                      Cleared!
                    </h2>
                    <p className="text-indigo-300 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-6 sm:mb-8">
                      Level {currentLevel + 1} Complete
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        sound.playClick();
                        setCurrentLevel(prev => prev + 1);
                      }}
                      className="group relative px-8 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl sm:rounded-2xl text-lg sm:text-xl font-black uppercase italic tracking-tighter shadow-[0_10px_30px_rgba(99,102,241,0.4)] hover:shadow-[0_15px_40px_rgba(99,102,241,0.6)] active:scale-95 transition-shadow overflow-hidden"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        Next Level
                        <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </motion.button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Game Over Overlay */}
            <AnimatePresence>
              {isGameOver && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center rounded-[2rem] sm:rounded-[2.5rem]"
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center p-4"
                  >
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-5xl mb-4"
                    >
                      💀
                    </motion.div>
                    <h2 className="text-4xl sm:text-5xl font-black text-white mb-2 tracking-tighter italic uppercase"
                      style={{ textShadow: '0 0 30px rgba(239,68,68,0.6)' }}>
                      Game Over
                    </h2>
                    <p className="text-rose-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-8">
                      You ran out of lives!
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        sound.playClick();
                        restartGame();
                      }}
                      className="group relative px-8 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-xl sm:rounded-2xl text-lg sm:text-xl font-black uppercase italic tracking-tighter shadow-[0_10px_30px_rgba(225,29,72,0.4)] hover:shadow-[0_15px_40px_rgba(225,29,72,0.6)] active:scale-95 transition-shadow"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        Back to Home
                        <RotateCcw className="w-6 h-6 group-hover:rotate-[-45deg] transition-transform" />
                      </span>
                    </motion.button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Footer Instructions */}
      <div className="p-4 sm:p-6 text-center">
        <p className="text-white/30 font-bold uppercase tracking-[0.2em] text-[9px] sm:text-[10px] px-4">
          Tap an arrow to slither away • Don't get blocked
        </p>
      </div>
    </div>
  );
}
