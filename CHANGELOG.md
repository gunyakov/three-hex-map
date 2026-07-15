# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-15

### Added

- **Rivers** - a `Land.land` ("grass") tile carrying the free-form `"river"` modifier
  (`TileInfo.modifiers`) renders an animated water channel flowing through the hex,
  drawn entirely by the land layer's shaders (no extra meshes or textures):
  - connectivity is auto-detected from neighbors: an edge connects when the neighbor
    is itself a river/lake tile, or is sea/coastal (the river's mouth) - see
    `src/helpers/rivers.ts`; map authors only mark tiles, there is no separate
    river-path data to keep in sync;
  - banks are bent by static world-space value noise, so the waterline curves
    naturally instead of tracing straight center-to-edge strips, and continues
    seamlessly across tile borders with no seams or width jumps;
  - a tile with one connection ends in a source pool, junctions/forks merge
    naturally, zero connections renders a pond;
  - shallow-to-deep color shading plus animated ripple noise (non-directional, since
    junctions have no single flow direction);
  - a noise-varied light vegetation strip hugs both banks;
  - the riverbed is carved as a real 3D depression (same technique as the coastal
    beach slope), merged with the beach sink at sea mouths.
- **Lakes** - a `Land.land` tile with the `"lake"` modifier fills the hex with water
  except a noise-curved grass shore rim inset from every edge whose neighbor is not
  water. Edges to other lake/sea/coastal tiles are fully open, so neighboring lake
  tiles merge into one continuous body; edges to river tiles keep the rim but get a
  channel-shaped opening that lines up exactly with the neighbor's river channel, so
  rivers visibly flow in and out of lakes.
- **New `HexMapOptions` / live-tunable properties** for the above (all live shader
  uniforms, no rebuild): `riverWidth`, `riverBankWidth`, `riverCurvature`,
  `riverColorShallow`/`riverColorDeep` (default to the map's water colors),
  `riverBankColor`, `riverFlowSpeed`, `riverDepth`, `lakeShoreWidth`.
- **War fog show/hide toggle** - new `HexMap.warFogVisible` property. Hiding the fog
  repaints every tile as visible for map inspection, while the per-tile fog states
  keep being recorded from `setTileFog()` underneath - re-showing repaints the
  *current* fog exactly, including updates made while it was hidden. Purely visual:
  GameEngine's fog tracking, unit visibility and pathfinding are untouched.
- Demo GUI: "war fog" checkbox, "Rivers & lakes" folder (width, bank width,
  curvature, flow speed, depth, lake shore, water/bank colors), and `window.game`
  exposed on the demo page for console debugging.
- Demo map (`public/gameInfo/map.json`): a test river network (source, junctions,
  two sea mouths) flowing through a 4-tile lake.

### Changed

- **BREAKING (map data): `TileInfo.wood` was removed** - wood is now a tile
  *modifier* like the others: `"modifiers": ["wood"]` instead of `"wood": true`.
  Existing map files must be migrated (the demo map has been).
- **BREAKING (API): the static water mode was removed** - sea/coastal tiles always
  render on the animated water layer. The `waterAnimation` option and the
  `HexMap.waterAnimation` getter/setter are gone, along with the flat atlas-textured
  water code path in `TerrainMesh` and the demo GUI's "enabled" switch.
- Tile modifiers are now the single home for per-tile flags: `"hill"`, `"wood"`,
  `"river"`, `"lake"` (documented in `src/interfaces.ts`).

### Fixed

- Fog of war no longer silently resets on layer rebuilds: changing grass density,
  `treesPerTile`, etc. used to recreate that layer with every tile visible until the
  next unit moved - rebuilt layers now get the recorded fog states reapplied.
- Grass blades and trees no longer stand in river/lake water:
  - the scatter clearance now accounts for the waterline's maximum outward noise
    bend (previously blades landed in every noise-pushed bulge of the water);
  - a blade with no dry spot found after the placement attempts is now dropped
    instead of being force-placed at the last (possibly in-water) attempt;
  - lake tiles are skipped entirely by grass/tree scatter - the dry shore rim is
    too narrow to place them reliably.
- Terrain shaders now run at `highp` precision - the world-space noise hash used by
  the river/lake rendering collapses into visible artifacts at lower precision.
- Instanced bitmask attributes are re-rounded to exact integers in the fragment
  shader before bit-decoding - varying interpolation is not exact even for values
  constant across an instance, and `floor(mask / 2^i)` otherwise decodes different
  bits on neighboring pixels (pixel-level garbage along the waterline).

## [0.3.0] - earlier

Baseline for this changelog: instanced terrain/water layers, animated water with
coastal foam waves, beach slopes, land-type edge blending, grass and forest layers,
cities, units/GameEngine, fog of war, pathfinding.
