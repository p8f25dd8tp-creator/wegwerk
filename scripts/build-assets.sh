#!/usr/bin/env bash
# Baut die Spiel-Assets aus den KayKit-Quellpaketen (CC0).
# Aufruf: scripts/build-assets.sh <pfad-zu-hex-repo> <pfad-zu-skelett-repo>
# Ergebnis liegt in public/assets/ und wird eingecheckt, CI braucht die Quellen nicht.
set -euo pipefail
HEX="$1/addons/kaykit_medieval_hexagon_pack/Assets/gltf"
SKEL="$2/addons/kaykit_character_pack_skeletons"
OUT="public/assets"
GT="npx --no-install gltf-transform"
mkdir -p "$OUT"

files=()
for n in hex_grass hex_water; do files+=("$HEX/tiles/base/$n.gltf"); done
for n in A B C D E; do files+=("$HEX/tiles/coast/hex_coast_$n.gltf"); done
for n in A B C D E F G H I J K L M; do files+=("$HEX/tiles/roads/hex_road_$n.gltf"); done
for n in trees_A_small trees_A_medium trees_A_large trees_B_small trees_B_medium trees_B_large \
         tree_single_A tree_single_B hills_A_trees hills_B_trees hill_single_A hill_single_B \
         mountain_A_grass_trees mountain_B_grass_trees mountain_C_grass_trees \
         rock_single_A rock_single_B rock_single_C cloud_big cloud_small \
         waterlily_A waterlily_B waterplant_A waterplant_B; do
  files+=("$HEX/decoration/nature/$n.gltf"); done
for n in barrel crate_A_big sack flag_red tent; do files+=("$HEX/decoration/props/$n.gltf"); done
for n in castle tower_A tower_B tower_catapult tower_base archeryrange home_A windmill; do
  files+=("$HEX/buildings/blue/building_${n}_blue.gltf"); done
for n in building_destroyed projectile_catapult; do files+=("$HEX/buildings/neutral/$n.gltf"); done
files+=("$HEX/buildings/red/building_tower_B_red.gltf")

TMP=$(mktemp -d)
$GT merge "${files[@]}" "$TMP/merged.glb" --merge-scenes
$GT dedup "$TMP/merged.glb" "$TMP/dedup.glb"
$GT meshopt "$TMP/dedup.glb" "$OUT/hex.glb" --level medium

# Skelette: nur die Animationen behalten, die das Spiel nutzt
KEEP="Walking_D_Skeletons|Walking_A|Walking_B|Walking_C|Running_A|Running_B|Hit_A|Hit_B|Death_A|Death_B|Spawn_Ground_Skeletons|Cheer|Idle"
for c in Skeleton_Minion Skeleton_Warrior; do
  node scripts/strip-anims.mjs "$SKEL/Characters/gltf/$c.glb" "$TMP/$c.glb" "$KEEP"
  $GT resample "$TMP/$c.glb" "$TMP/${c}_r.glb"
  $GT meshopt "$TMP/${c}_r.glb" "$OUT/$c.glb" --level medium
done
ls -la "$OUT"
