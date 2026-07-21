export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Point {
  x: number;
  y: number;
}

export interface Worm {
  id: string;
  cells: Point[];
  direction: Direction;
}

export const LEVELS: Worm[][] = [
  // Level 1: Intro - Snake 1 blocks Snake 2. Snake 1 is free.
  [
    { 
      id: '1', 
      cells: [{x: 1, y: 1}, {x: 1, y: 2}, {x: 1, y: 3}, {x: 2, y: 3}, {x: 3, y: 3}], 
      direction: 'RIGHT' 
    },
    { 
      id: '2', 
      cells: [{x: 5, y: 1}, {x: 5, y: 2}, {x: 5, y: 3}, {x: 5, y: 4}, {x: 5, y: 5}], 
      direction: 'DOWN' 
    },
  ],
  // Level 2: Chain - 1 blocks 2, 2 blocks 3. 1 is free.
  [
    { 
      id: '1', 
      cells: [{x: 1, y: 1}, {x: 2, y: 1}, {x: 3, y: 1}, {x: 4, y: 1}, {x: 5, y: 1}], 
      direction: 'RIGHT' 
    },
    { 
      id: '2', 
      cells: [{x: 7, y: 0}, {x: 7, y: 1}, {x: 7, y: 2}, {x: 7, y: 3}, {x: 7, y: 4}, {x: 8, y: 4}], 
      direction: 'RIGHT' 
    },
    { 
      id: '3', 
      cells: [{x: 9, y: 2}, {x: 9, y: 3}, {x: 9, y: 4}, {x: 9, y: 5}, {x: 9, y: 6}, {x: 8, y: 6}], 
      direction: 'LEFT' 
    },
  ],
  // Level 3: Split Chains - 1 blocks 2, 3 blocks 4. 1 and 3 are free.
  [
    { 
      id: '1', 
      cells: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 3, y: 0}, {x: 3, y: 1}, {x: 3, y: 2}], 
      direction: 'DOWN' 
    },
    { 
      id: '2', 
      cells: [{x: 0, y: 3}, {x: 1, y: 3}, {x: 2, y: 3}, {x: 3, y: 3}, {x: 4, y: 3}], 
      direction: 'RIGHT' 
    },
    { 
      id: '3', 
      cells: [{x: 9, y: 0}, {x: 8, y: 0}, {x: 7, y: 0}, {x: 6, y: 0}, {x: 6, y: 1}, {x: 6, y: 2}], 
      direction: 'DOWN' 
    },
    { 
      id: '4', 
      cells: [{x: 9, y: 5}, {x: 8, y: 5}, {x: 7, y: 5}, {x: 6, y: 5}, {x: 5, y: 5}], 
      direction: 'LEFT' 
    },
  ],
  // Level 4: The Spiral Chain - 1 blocks 2, 2 blocks 3, 3 blocks 4, 4 blocks 5.
  [
    { 
      id: '1', 
      cells: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 3, y: 0}, {x: 4, y: 0}, {x: 5, y: 0}], 
      direction: 'RIGHT' 
    },
    { 
      id: '2', 
      cells: [{x: 7, y: 0}, {x: 7, y: 1}, {x: 7, y: 2}, {x: 7, y: 3}, {x: 7, y: 4}, {x: 6, y: 4}], 
      direction: 'LEFT' 
    },
    { 
      id: '3', 
      cells: [{x: 4, y: 5}, {x: 4, y: 4}, {x: 4, y: 3}, {x: 3, y: 3}, {x: 2, y: 3}, {x: 1, y: 3}], 
      direction: 'LEFT' 
    },
    { 
      id: '4', 
      cells: [{x: 0, y: 5}, {x: 1, y: 5}, {x: 2, y: 5}, {x: 2, y: 6}, {x: 2, y: 7}, {x: 3, y: 7}], 
      direction: 'RIGHT' 
    },
    { 
      id: '5', 
      cells: [{x: 5, y: 8}, {x: 5, y: 7}, {x: 5, y: 6}, {x: 6, y: 6}, {x: 7, y: 6}, {x: 8, y: 6}], 
      direction: 'RIGHT' 
    },
  ],
  // Level 5: The Complex Knot - Solvable in order 1 -> 2 -> 3 -> 4 -> 5 -> 6
  [
    { id: '1', cells: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 3, y: 0}, {x: 4, y: 0}, {x: 5, y: 0}], direction: 'RIGHT' },
    { id: '2', cells: [{x: 7, y: 0}, {x: 7, y: 1}, {x: 7, y: 2}, {x: 6, y: 2}, {x: 5, y: 2}, {x: 4, y: 2}], direction: 'LEFT' },
    { id: '3', cells: [{x: 2, y: 2}, {x: 2, y: 3}, {x: 2, y: 4}, {x: 3, y: 4}, {x: 4, y: 4}, {x: 5, y: 4}], direction: 'RIGHT' },
    { id: '4', cells: [{x: 7, y: 4}, {x: 7, y: 5}, {x: 7, y: 6}, {x: 6, y: 6}, {x: 5, y: 6}, {x: 4, y: 6}], direction: 'LEFT' },
    { id: '5', cells: [{x: 2, y: 6}, {x: 2, y: 7}, {x: 2, y: 8}, {x: 3, y: 8}, {x: 4, y: 8}, {x: 5, y: 8}], direction: 'RIGHT' },
    { id: '6', cells: [{x: 7, y: 8}, {x: 7, y: 9}, {x: 8, y: 9}, {x: 9, y: 9}, {x: 9, y: 8}, {x: 9, y: 7}], direction: 'UP' },
  ]
];
