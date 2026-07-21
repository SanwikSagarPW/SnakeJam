import { Point, Direction, Worm } from './levels';

const GRID_W = 10;
const GRID_H = 10;

function isOccupied(point: Point, occupied: Set<string>) {
  return occupied.has(`${point.x},${point.y}`);
}

function getNeighbors(p: Point): { p: Point; dir: Direction }[] {
  return [
    { p: { x: p.x, y: p.y - 1 }, dir: 'UP' },
    { p: { x: p.x, y: p.y + 1 }, dir: 'DOWN' },
    { p: { x: p.x - 1, y: p.y }, dir: 'LEFT' },
    { p: { x: p.x + 1, y: p.y }, dir: 'RIGHT' },
  ];
}

function canMove(snake: Worm, allSnakes: Worm[], removedIds: Set<string>): boolean {
  const head = snake.cells[snake.cells.length - 1];
  const dx = snake.direction === 'LEFT' ? -1 : snake.direction === 'RIGHT' ? 1 : 0;
  const dy = snake.direction === 'UP' ? -1 : snake.direction === 'DOWN' ? 1 : 0;

  let curX = head.x + dx;
  let curY = head.y + dy;

  while (curX >= 0 && curX < GRID_W && curY >= 0 && curY < GRID_H) {
    for (const other of allSnakes) {
      if (removedIds.has(other.id)) continue;
      if (other.id === snake.id) continue;
      if (other.cells.some(c => c.x === curX && c.y === curY)) {
        return false;
      }
    }
    curX += dx;
    curY += dy;
  }
  return true;
}

function isSolvable(snakes: Worm[]): boolean {
  const removedIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const snake of snakes) {
      if (removedIds.has(snake.id)) continue;
      if (canMove(snake, snakes, removedIds)) {
        removedIds.add(snake.id);
        changed = true;
      }
    }
  }
  return removedIds.size === snakes.length;
}

export function generateProceduralLevel(levelNum: number): Worm[] {
  const snakes: Worm[] = [];
  const occupied = new Set<string>();
  
  // Increase difficulty with level
  const snakeCount = Math.min(3 + Math.floor(levelNum / 1.5), 15);
  const minLength = 2;
  const maxLength = Math.min(4 + Math.floor(levelNum / 2), 12);

  let attempts = 0;
  while (snakes.length < snakeCount && attempts < 3000) {
    attempts++;
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    
    // Pick a random start point, but prefer points near existing snakes for "density"
    let startX, startY;
    if (snakes.length > 0 && Math.random() > 0.3) {
      const randomSnake = snakes[Math.floor(Math.random() * snakes.length)];
      const randomCell = randomSnake.cells[Math.floor(Math.random() * randomSnake.cells.length)];
      const neighbors = getNeighbors(randomCell).filter(n => 
        n.p.x >= 0 && n.p.x < GRID_W && n.p.y >= 0 && n.p.y < GRID_H &&
        !isOccupied(n.p, occupied)
      );
      if (neighbors.length === 0) continue;
      const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
      startX = chosen.p.x;
      startY = chosen.p.y;
    } else {
      startX = Math.floor(Math.random() * GRID_W);
      startY = Math.floor(Math.random() * GRID_H);
    }

    if (isOccupied({ x: startX, y: startY }, occupied)) continue;

    const cells: Point[] = [{ x: startX, y: startY }];
    const tempOccupied = new Set<string>([`${startX},${startY}`]);
    let possible = true;

    for (let i = 1; i < length; i++) {
      const last = cells[cells.length - 1];
      const neighbors = getNeighbors(last).filter(n => 
        n.p.x >= 0 && n.p.x < GRID_W && n.p.y >= 0 && n.p.y < GRID_H &&
        !isOccupied(n.p, occupied) && !tempOccupied.has(`${n.p.x},${n.p.y}`)
      );
      
      if (neighbors.length === 0) {
        possible = false;
        break;
      }
      
      // Prefer neighbors that are also near other snakes to increase density
      const scoredNeighbors = neighbors.map(n => {
        let score = 0;
        getNeighbors(n.p).forEach(nn => {
          if (isOccupied(nn.p, occupied)) score++;
        });
        return { n, score };
      });
      
      scoredNeighbors.sort((a, b) => b.score - a.score);
      const topNeighbors = scoredNeighbors.filter(sn => sn.score === scoredNeighbors[0].score);
      const next = topNeighbors[Math.floor(Math.random() * topNeighbors.length)].n;
      
      cells.push(next.p);
      tempOccupied.add(`${next.p.x},${next.p.y}`);
    }

    if (!possible) continue;

    // Determine direction: must face AWAY from body
    // In UI, head is the LAST element. So neck is the second to last.
    const head = cells[cells.length - 1];
    const neck = cells[cells.length - 2];
    const dx = head.x - neck.x;
    const dy = head.y - neck.y;
    let direction: Direction = 'RIGHT';
    if (dx === 1) direction = 'RIGHT';
    else if (dx === -1) direction = 'LEFT';
    else if (dy === 1) direction = 'DOWN';
    else if (dy === -1) direction = 'UP';

    // Check if head points to its own body
    let pointsToSelf = false;
    let checkX = head.x + dx;
    let checkY = head.y + dy;
    while (checkX >= 0 && checkX < GRID_W && checkY >= 0 && checkY < GRID_H) {
      if (cells.some(c => c.x === checkX && c.y === checkY)) {
        pointsToSelf = true;
        break;
      }
      checkX += dx;
      checkY += dy;
    }
    if (pointsToSelf) continue;

    // Check head-to-head rule: Two snakes should not point directly at each other's heads
    let headToHead = false;
    for (const s of snakes) {
      const otherHead = s.cells[s.cells.length - 1];
      const otherDx = s.direction === 'LEFT' ? -1 : s.direction === 'RIGHT' ? 1 : 0;
      const otherDy = s.direction === 'UP' ? -1 : s.direction === 'DOWN' ? 1 : 0;

      // Check if current snake points to other snake's head
      let curX = head.x + dx;
      let curY = head.y + dy;
      let pointsToOtherHead = false;
      while (curX >= 0 && curX < GRID_W && curY >= 0 && curY < GRID_H) {
        if (curX === otherHead.x && curY === otherHead.y) {
          pointsToOtherHead = true;
          break;
        }
        curX += dx;
        curY += dy;
      }

      // Check if other snake points to current snake's head
      let oX = otherHead.x + otherDx;
      let oY = otherHead.y + otherDy;
      let otherPointsToCurHead = false;
      while (oX >= 0 && oX < GRID_W && oY >= 0 && oY < GRID_H) {
        if (oX === head.x && oY === head.y) {
          otherPointsToCurHead = true;
          break;
        }
        oX += otherDx;
        oY += otherDy;
      }

      if (pointsToOtherHead && otherPointsToCurHead) {
        headToHead = true;
        break;
      }
    }
    if (headToHead) continue;

    // Check if head points to any other snake's body (early deadlock check)
    // This is optional as isSolvable handles it, but helps density logic
    let pointsToOtherBody = false;
    for (const s of snakes) {
      let curX = head.x + dx;
      let curY = head.y + dy;
      while (curX >= 0 && curX < GRID_W && curY >= 0 && curY < GRID_H) {
        if (s.cells.some(c => c.x === curX && c.y === curY)) {
          pointsToOtherBody = true;
          break;
        }
        curX += dx;
        curY += dy;
      }
      if (pointsToOtherBody) break;
    }
    // We allow pointing to other bodies (it's a puzzle!), 
    // but we must ensure at least one snake is free.
    // isSolvable will check the final set.

    const newSnake: Worm = {
      id: Math.random().toString(36).substr(2, 9),
      cells: [...cells],
      direction
    };

    snakes.push(newSnake);
    tempOccupied.forEach(p => occupied.add(p));
  }

  // Final check for solvability, minimum snake count, and "bottleneck" constraint
  const freeSnakes = snakes.filter(s => canMove(s, snakes, new Set())).length;
  
  // As requested: 3, 4, 5 snakes should have only 1 free snake.
  // We'll generalize this: for levels with many snakes, we want a very tight bottleneck.
  let maxFree = 1;
  if (snakes.length >= 8) maxFree = 2; // Allow a bit more breathing room for very large puzzles
  if (snakes.length >= 12) maxFree = 3;

  if (snakes.length < Math.min(snakeCount, 3) || !isSolvable(snakes) || freeSnakes > maxFree) {
    return generateProceduralLevel(levelNum);
  }

  return snakes;
}
