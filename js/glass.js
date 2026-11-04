import {
  GlassDistortionShapes,
  GlassGridShapes,
  ShaderFitOptions,
  ShaderMount,
  defaultObjectSizing,
  flutedGlassFragmentShader,
  getShaderColorFromString,
} from "../vendor/paper-shaders/index.js";

const sizing = defaultObjectSizing;

// The mount only accepts a loaded <img> for its first texture; later frames are
// uploaded straight from a video or canvas through `draw`.
export function mountGlass(host, poster) {
  const mount = new ShaderMount(
    host,
    flutedGlassFragmentShader,
    {
      u_image: poster,
      u_colorBack: getShaderColorFromString("#00000000"),
      u_colorShadow: getShaderColorFromString("#000000"),
      u_colorHighlight: getShaderColorFromString("#ffffff"),
      u_shadows: 0.25,
      u_highlights: 0.1,
      u_size: 0.5,
      u_shape: GlassGridShapes.lines,
      u_angle: 0,
      u_distortionShape: GlassDistortionShapes.prism,
      u_distortion: 0.5,
      u_shift: 0,
      u_stretch: 0,
      u_blur: 0,
      u_edges: 0.25,
      u_marginLeft: 0,
      u_marginRight: 0,
      u_marginTop: 0,
      u_marginBottom: 0,
      u_grainMixer: 0,
      u_grainOverlay: 0,
      u_fit: ShaderFitOptions.cover,
      u_scale: sizing.scale,
      u_rotation: sizing.rotation,
      u_offsetX: sizing.offsetX,
      u_offsetY: sizing.offsetY,
      u_originX: sizing.originX,
      u_originY: sizing.originY,
      u_worldWidth: sizing.worldWidth,
      u_worldHeight: sizing.worldHeight,
    },
    undefined,
    0,
    0,
    2,
    undefined,
    ["u_image"]
  );

  const gl = mount.gl;

  function draw(source, width, height) {
    const run = () => {
      const texture = mount.textures.get("u_image");
      const textureUnit = mount.textureUnitMap.get("u_image");
      const aspect = mount.uniformLocations.u_imageAspectRatio;
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      if (aspect && width && height) gl.uniform1f(aspect, width / height);
      mount.render(performance.now());
    };
    if (mount.ready) {
      run();
      return Promise.resolve();
    }
    return mount.whenReady().then((ok) => {
      if (ok) run();
    });
  }

  // Resolves once the program is linked and a full-size warmup frame has finished on the GPU.
  const compiled = mount.whenReady().then(async (ok) => {
    if (!ok) return false;
    const started = performance.now();
    const fullSize = () => mount.canvasElement.width >= mount.parentElement.clientWidth;
    while (!fullSize() && performance.now() - started < 1500) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    mount.render(performance.now());
    await gpuIdle(gl);
    return true;
  });

  return { mount, draw, compiled, idle: () => gpuIdle(gl) };
}

function gpuIdle(gl) {
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  if (!sync) return Promise.resolve();
  const started = performance.now();
  return new Promise((resolve) => {
    const poll = () => {
      const status = gl.clientWaitSync(sync, 0, 0);
      if (
        status === gl.ALREADY_SIGNALED ||
        status === gl.CONDITION_SATISFIED ||
        status === gl.WAIT_FAILED ||
        performance.now() - started > 8000
      ) {
        gl.deleteSync(sync);
        resolve();
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}
