import {
  normalizeVideoAssetManifest,
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "./video-assets";

export type BlenderLoopPreset = "radar_grid" | "terminal_scan" | "liquidity_depth" | "orbital_map";

export interface BuildBlenderAssetPlanOptions {
  presets: BlenderLoopPreset[];
  fps: number;
  seconds: number;
  width: number;
  height: number;
}

export interface BlenderScenePythonOptions {
  preset: BlenderLoopPreset;
  outputPath: string;
  fps: number;
  seconds: number;
  width: number;
  height: number;
}

export interface BlenderAssetPlanItem {
  id: string;
  preset: BlenderLoopPreset;
  filename: string;
  frames: number;
  fps: number;
  seconds: number;
  width: number;
  height: number;
  manifestAsset: VideoAssetLayer;
}

const PRESET_ORDER: BlenderLoopPreset[] = ["radar_grid", "terminal_scan", "liquidity_depth", "orbital_map"];

const PRESET_TAGS: Record<BlenderLoopPreset, string[]> = {
  radar_grid: ["blender", "generated", "market", "signal", "radar_grid"],
  terminal_scan: ["blender", "generated", "market", "chart", "terminal_scan"],
  liquidity_depth: ["blender", "generated", "market", "chart", "liquidity_depth"],
  orbital_map: ["blender", "generated", "market", "network", "orbital_map"],
};

const PRESET_LABELS: Record<BlenderLoopPreset, string> = {
  radar_grid: "Blender generated radar grid loop",
  terminal_scan: "Blender generated terminal scan loop",
  liquidity_depth: "Blender generated liquidity depth loop",
  orbital_map: "Blender generated orbital market map loop",
};

function slugPreset(preset: BlenderLoopPreset): string {
  return preset.replace(/_/g, "-");
}

function clampPositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export function parseBlenderPresets(input: string | undefined): BlenderLoopPreset[] {
  if (!input || input.trim().toLowerCase() === "all") return [...PRESET_ORDER];

  const presets = input
    .split(",")
    .map((preset) => preset.trim().toLowerCase().replace(/-/g, "_"))
    .filter((preset): preset is BlenderLoopPreset => PRESET_ORDER.includes(preset as BlenderLoopPreset));

  return presets.length > 0 ? presets : [...PRESET_ORDER];
}

export function buildBlenderAssetPlan(options: BuildBlenderAssetPlanOptions): BlenderAssetPlanItem[] {
  const width = clampPositiveInteger(options.width, 1080);
  const height = clampPositiveInteger(options.height, 1920);
  const fps = clampPositiveInteger(options.fps, 30);
  const seconds = clampPositiveInteger(options.seconds, 8);
  const frames = fps * seconds;

  return options.presets.map((preset) => {
    const slug = slugPreset(preset);
    const id = `blender-${slug}`;
    const filename = `${id}.mp4`;

    return {
      id,
      preset,
      filename,
      frames,
      fps,
      seconds,
      width,
      height,
      manifestAsset: {
        id,
        kind: "video",
        source: "local",
        src: `broll/${filename}`,
        provider: "generated",
        orientation: height >= width ? "vertical" : "horizontal",
        role: "background",
        fit: "cover",
        opacity: 0.24,
        blur: 0,
        saturation: 1.12,
        playbackRate: 1,
        tags: PRESET_TAGS[preset],
        attribution: PRESET_LABELS[preset],
      },
    };
  });
}

export function mergeBlenderAssetsIntoManifest(
  manifest: VideoAssetManifest,
  plan: BlenderAssetPlanItem[],
  updatedAt = new Date().toISOString(),
): VideoAssetManifest {
  const current = normalizeVideoAssetManifest(manifest);
  const generatedById = new Map(plan.map((item) => [item.manifestAsset.id, item.manifestAsset]));
  const mergedAssets = current.assets.map((asset) => generatedById.get(asset.id) || asset);
  const existingIds = new Set(mergedAssets.map((asset) => asset.id));

  for (const item of plan) {
    if (!existingIds.has(item.manifestAsset.id)) {
      mergedAssets.push(item.manifestAsset);
      existingIds.add(item.manifestAsset.id);
    }
  }

  return normalizeVideoAssetManifest({
    updatedAt,
    assets: mergedAssets,
  });
}

export function createBlenderScenePython(options: BlenderScenePythonOptions): string {
  const width = clampPositiveInteger(options.width, 1080);
  const height = clampPositiveInteger(options.height, 1920);
  const fps = clampPositiveInteger(options.fps, 30);
  const seconds = clampPositiveInteger(options.seconds, 8);
  const frames = fps * seconds;
  const outputPath = options.outputPath.replace(/\\/g, "/");

  return `import bpy
import math
from mathutils import Vector

PRESET = ${JSON.stringify(options.preset)}
OUTPUT_PATH = ${JSON.stringify(outputPath)}
FPS = ${fps}
FRAMES = ${frames}

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def make_mat(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    if node:
        if "Base Color" in node.inputs:
            node.inputs["Base Color"].default_value = color
        if "Emission Color" in node.inputs:
            node.inputs["Emission Color"].default_value = color
        if "Emission Strength" in node.inputs:
            node.inputs["Emission Strength"].default_value = 1.4
    return mat

def cube(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    return obj

def sphere(name, loc, radius, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def torus(name, radius, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.008, major_segments=96, minor_segments=8)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def animate_spin(obj, axis=2, turns=1):
    obj.keyframe_insert(data_path="rotation_euler", frame=1)
    obj.rotation_euler[axis] += math.tau * turns
    obj.keyframe_insert(data_path="rotation_euler", frame=FRAMES)
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for keyframe in fc.keyframe_points:
                keyframe.interpolation = "LINEAR"

def setup_scene():
    clear_scene()
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = ${frames}
    scene.render.fps = FPS
    scene.render.resolution_x = ${width}
    scene.render.resolution_y = ${height}
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.filepath = OUTPUT_PATH
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 32
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.005, 0.008, 0.014)

    bpy.ops.object.light_add(type="AREA", location=(0, -4, 7))
    light = bpy.context.object
    light.name = "softbox"
    light.data.energy = 450
    light.data.size = 5

    bpy.ops.object.camera_add(location=(0, -7.5, 5.6), rotation=(math.radians(58), 0, 0))
    camera = bpy.context.object
    camera.name = "vertical_camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 6.8
    scene.camera = camera
    return scene

def build_radar_grid(cyan, green, red, muted):
    for i in range(-5, 6):
        cube("grid_x_" + str(i), (i * 0.48, 0, 0), (0.006, 2.8, 0.006), muted)
        cube("grid_y_" + str(i), (0, i * 0.48, 0), (2.8, 0.006, 0.006), muted)
    for radius in [0.55, 1.1, 1.65, 2.2]:
        ring = torus("radar_ring_" + str(radius), radius, cyan)
        ring.location.z = 0.02
    sweep = cube("radar_sweep", (0, 1.05, 0.08), (0.025, 1.18, 0.012), green)
    sweep.location.x = 0
    animate_spin(sweep, turns=1)
    pulse = sphere("signal_core", (0, 0, 0.16), 0.11, cyan)
    pulse.keyframe_insert(data_path="scale", frame=1)
    pulse.scale = (1.45, 1.45, 1.45)
    pulse.keyframe_insert(data_path="scale", frame=FRAMES)

def build_terminal_scan(cyan, green, red, muted):
    for row in range(9):
        y = -2.2 + row * 0.55
        width = 1.2 + (row % 4) * 0.36
        bar = cube("terminal_line_" + str(row), (-0.7 + row * 0.04, y, 0.05), (width, 0.035, 0.02), cyan if row % 3 else green)
        bar.keyframe_insert(data_path="location", frame=1)
        bar.location.x += 0.32
        bar.keyframe_insert(data_path="location", frame=FRAMES)
    for col in range(6):
        x = -2.2 + col * 0.85
        height = 0.45 + (col % 3) * 0.22
        cube("terminal_panel_" + str(col), (x, 1.75, 0.08), (0.28, height, 0.025), muted)
    scan = cube("scan_beam", (0, -2.7, 0.14), (2.7, 0.028, 0.018), green)
    scan.keyframe_insert(data_path="location", frame=1)
    scan.location.y = 2.7
    scan.keyframe_insert(data_path="location", frame=FRAMES)

def build_liquidity_depth(cyan, green, red, muted):
    for i in range(18):
        depth = 0.24 + (i % 6) * 0.13
        y = -2.5 + i * 0.29
        left = cube("bid_depth_" + str(i), (-0.42 - depth / 2, y, 0.05), (depth, 0.06, 0.025), green)
        right = cube("ask_depth_" + str(i), (0.42 + depth / 2, y, 0.05), (depth * 0.86, 0.06, 0.025), red)
        left.keyframe_insert(data_path="scale", frame=1)
        right.keyframe_insert(data_path="scale", frame=1)
        left.scale.x *= 1.18
        right.scale.x *= 0.92
        left.keyframe_insert(data_path="scale", frame=FRAMES)
        right.keyframe_insert(data_path="scale", frame=FRAMES)
    cube("mid_price_axis", (0, 0, 0.1), (0.018, 2.7, 0.02), cyan)

def build_orbital_map(cyan, green, red, muted):
    nodes = [(-1.3, -1.5, 0.3), (1.1, -1.1, 0.42), (-0.7, 0.1, 0.62), (1.4, 0.6, 0.48), (-1.0, 1.5, 0.52), (0.25, 2.0, 0.74)]
    for i, loc in enumerate(nodes):
        obj = sphere("market_node_" + str(i), loc, 0.1 + (i % 3) * 0.025, cyan if i % 2 else green)
        obj.keyframe_insert(data_path="location", frame=1)
        obj.location.z += 0.14
        obj.keyframe_insert(data_path="location", frame=FRAMES)
    for radius in [0.9, 1.55, 2.2]:
        ring = torus("orbit_" + str(radius), radius, muted)
        ring.location.z = 0.05
        animate_spin(ring, turns=1 if radius < 2 else -1)
    satellite = sphere("orbiting_signal", (1.8, 0, 0.36), 0.08, red)
    animate_spin(satellite, turns=1)

scene = setup_scene()
cyan = make_mat("cyan_signal", (0.05, 0.86, 1.0, 1.0))
green = make_mat("green_gain", (0.0, 1.0, 0.48, 1.0))
red = make_mat("red_risk", (1.0, 0.18, 0.26, 1.0))
muted = make_mat("muted_grid", (0.12, 0.22, 0.32, 0.78))

if PRESET == "radar_grid":
    build_radar_grid(cyan, green, red, muted)
elif PRESET == "terminal_scan":
    build_terminal_scan(cyan, green, red, muted)
elif PRESET == "liquidity_depth":
    build_liquidity_depth(cyan, green, red, muted)
else:
    build_orbital_map(cyan, green, red, muted)

bpy.ops.render.render(animation=True)
`;
}
