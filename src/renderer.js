export class SpriteRenderer {
  constructor(targetCanvas, atlasData) {
    this.canvas = targetCanvas;
    this.atlas = atlasData;
    this.gl = targetCanvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!this.gl) {
      throw new Error("WebGL is not available in this browser");
    }

    this.maxQuads = 12000;
    this.stride = 8;
    this.vertices = new Float32Array(this.maxQuads * 6 * this.stride);
    this.vertexCount = 0;
    this.stats = this.createEmptyStats();
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.program = this.createProgram();
    this.buffer = this.gl.createBuffer();
    this.texture = this.createTexture(atlasData.canvas);
    this.bindState();
  }

  createProgram() {
    const vertex = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      attribute vec4 a_color;
      uniform vec2 u_resolution;
      varying vec2 v_uv;
      varying vec4 v_color;
      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 clip = zeroToOne * 2.0 - 1.0;
        gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
        v_uv = a_uv;
        v_color = a_color;
      }
    `;

    const fragment = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_uv;
      varying vec4 v_color;
      void main() {
        gl_FragColor = texture2D(u_texture, v_uv) * v_color;
      }
    `;

    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, vertex);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Unable to link shader program");
    }
    return program;
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Unable to compile shader");
    }
    return shader;
  }

  createTexture(source) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  bindState() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const strideBytes = this.stride * 4;
    const pos = gl.getAttribLocation(this.program, "a_position");
    const uv = gl.getAttribLocation(this.program, "a_uv");
    const color = gl.getAttribLocation(this.program, "a_color");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, strideBytes, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, strideBytes, 2 * 4);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 4, gl.FLOAT, false, strideBytes, 4 * 4);
    this.resolutionLocation = gl.getUniformLocation(this.program, "u_resolution");
    gl.uniform1i(gl.getUniformLocation(this.program, "u_texture"), 0);
  }

  resize(width, height, dpr) {
    if (this.width === width && this.height === height && this.dpr === dpr) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.resolutionLocation, width, height);
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(0.58, 0.78, 0.42, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  createEmptyStats() {
    return {
      quads: 0,
      flushes: 0,
      drawCalls: 0,
      maxVertices: 0,
      skippedSprites: 0,
      frameBufferUploads: 0,
    };
  }

  begin() {
    this.vertexCount = 0;
    this.stats = this.createEmptyStats();
  }

  draw(name, x, y, width, height, options = {}) {
    const sprite = this.atlas.sprites[name];
    if (!sprite) {
      this.stats.skippedSprites += 1;
      return;
    }

    if (this.vertexCount + 6 >= this.maxQuads * 6) {
      this.flush();
    }

    const scale = this.dpr;
    const cx = x * scale;
    const cy = y * scale;
    const hw = (width * scale) / 2;
    const hh = (height * scale) / 2;
    const rotation = options.rotation || 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const tint = options.tint || [1, 1, 1];
    const alpha = options.alpha ?? 1;
    const r = tint[0];
    const g = tint[1];
    const b = tint[2];
    const x0 = -hw;
    const y0 = -hh;
    const x1 = hw;
    const y1 = hh;
    const u0 = sprite.u0;
    const v0 = sprite.v0;
    const u1 = sprite.u1;
    const v1 = sprite.v1;

    const px0 = x0 * cos - y0 * sin + cx;
    const py0 = x0 * sin + y0 * cos + cy;
    const px1 = x1 * cos - y0 * sin + cx;
    const py1 = x1 * sin + y0 * cos + cy;
    const px2 = x1 * cos - y1 * sin + cx;
    const py2 = x1 * sin + y1 * cos + cy;
    const px3 = x0 * cos - y1 * sin + cx;
    const py3 = x0 * sin + y1 * cos + cy;

    const vertices = this.vertices;
    let offset = this.vertexCount * this.stride;
    vertices[offset] = px0;
    vertices[offset + 1] = py0;
    vertices[offset + 2] = u0;
    vertices[offset + 3] = v0;
    vertices[offset + 4] = r;
    vertices[offset + 5] = g;
    vertices[offset + 6] = b;
    vertices[offset + 7] = alpha;
    offset += this.stride;
    vertices[offset] = px1;
    vertices[offset + 1] = py1;
    vertices[offset + 2] = u1;
    vertices[offset + 3] = v0;
    vertices[offset + 4] = r;
    vertices[offset + 5] = g;
    vertices[offset + 6] = b;
    vertices[offset + 7] = alpha;
    offset += this.stride;
    vertices[offset] = px2;
    vertices[offset + 1] = py2;
    vertices[offset + 2] = u1;
    vertices[offset + 3] = v1;
    vertices[offset + 4] = r;
    vertices[offset + 5] = g;
    vertices[offset + 6] = b;
    vertices[offset + 7] = alpha;
    offset += this.stride;
    vertices[offset] = px0;
    vertices[offset + 1] = py0;
    vertices[offset + 2] = u0;
    vertices[offset + 3] = v0;
    vertices[offset + 4] = r;
    vertices[offset + 5] = g;
    vertices[offset + 6] = b;
    vertices[offset + 7] = alpha;
    offset += this.stride;
    vertices[offset] = px2;
    vertices[offset + 1] = py2;
    vertices[offset + 2] = u1;
    vertices[offset + 3] = v1;
    vertices[offset + 4] = r;
    vertices[offset + 5] = g;
    vertices[offset + 6] = b;
    vertices[offset + 7] = alpha;
    offset += this.stride;
    vertices[offset] = px3;
    vertices[offset + 1] = py3;
    vertices[offset + 2] = u0;
    vertices[offset + 3] = v1;
    vertices[offset + 4] = r;
    vertices[offset + 5] = g;
    vertices[offset + 6] = b;
    vertices[offset + 7] = alpha;

    this.vertexCount += 6;
    this.stats.quads += 1;
    this.stats.maxVertices = Math.max(this.stats.maxVertices, this.vertexCount);
  }

  flush() {
    if (this.vertexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.vertexCount * this.stride), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    this.stats.flushes += 1;
    this.stats.drawCalls += 1;
    this.stats.frameBufferUploads += 1;
    this.vertexCount = 0;
  }
}
