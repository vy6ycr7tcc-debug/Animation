/* Six clearings, chosen the way the old homes were chosen — by asking the
   land itself, through the same height function that raises every hill and
   lowers every shore, which ground would hold a body kindly: dry, high, or
   at the water's edge. Each sits three hundred metres or more from any
   archetype's hearth, so the lessons arrive as guests and never crowd the
   houses. Here the temple tour stops, and stays a while. */

export interface SiteDef {
  x: number;
  z: number;
  y: number;
  heading: number;
}

export const SITES: Record<"shore" | "igloo" | "garden" | "galaxies" | "desert" | "tree" | "tree-station", SiteDef> = {
  shore:    { x: -590,    z: 900,     y: 1.88,  heading: 2.561  },
  igloo:    { x: 2097.8,  z: -1180.4, y: 19.76, heading: -1.058 },
  garden:   { x: -1600,   z: 1200,    y: 4.21,  heading: 2.214  },
  galaxies: { x: 475.4,   z: 1794.1,  y: 13.59, heading: -2.883 },
  desert:   { x: 2270.5,  z: 175,     y: 12.67, heading: -1.648 },
  tree:     { x: -2428.1, z: -1044.9, y: 19.35, heading: 1.164  },
  "tree-station": { x: -1200, z: 1600, y: 5.0, heading: 0.303 }, // TEMP-VERIFY (harness sets final)
};
