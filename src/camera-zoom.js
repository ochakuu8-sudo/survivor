// Camera zoom-out shim.
// main-v7 renders in CSS-pixel world units. This module widens the WebGL
// projection and shifts the camera so the player remains centered.

const ZOOM_OUT = 1.35;
const uniformNames = new WeakMap();
const lastResolution = { width: window.innerWidth, height: window.innerHeight };

const originalGetUniformLocation = WebGLRenderingContext.prototype.getUniformLocation;
WebGLRenderingContext.prototype.getUniformLocation = function patchedGetUniformLocation(program, name) {
  const location = originalGetUniformLocation.call(this, program, name);
  if (location) uniformNames.set(location, name);
  return location;
};

const originalUniform2f = WebGLRenderingContext.prototype.uniform2f;
WebGLRenderingContext.prototype.uniform2f = function patchedUniform2f(location, x, y) {
  const name = uniformNames.get(location);

  if (name === 'u_resolution') {
    lastResolution.width = x;
    lastResolution.height = y;
    return originalUniform2f.call(this, location, x * ZOOM_OUT, y * ZOOM_OUT);
  }

  if (name === 'u_camera') {
    const cameraX = x - (lastResolution.width * (ZOOM_OUT - 1)) / 2;
    const cameraY = y - (lastResolution.height * (ZOOM_OUT - 1)) / 2;
    return originalUniform2f.call(this, location, cameraX, cameraY);
  }

  return originalUniform2f.call(this, location, x, y);
};
