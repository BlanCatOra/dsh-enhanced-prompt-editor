/**
 * dsh-enhanced-prompt-editor —— 浏览器侧音频采集（纯函数 + 采集器）。
 *
 * 与 DSH 语音插件共用同一份宿主契约：16 kHz 单声道 PCM16 WAV，base64
 * 走 JSON Remote。这里不 import 任何 DSH 包，因此可以独立单测。
 *
 * @module dsh-enhanced-prompt-editor/audio
 */

/** 采集失败的原因码，由调用方本地化。 */
export class RecordingError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
    this.name = 'RecordingError';
  }
}

/**
 * 把浮点采样编成 Host 接受的规范 PCM16 WAV。
 *
 * @param samples 16 kHz 单声道、范围 [-1,1] 的采样。
 * @returns 完整的 little-endian WAV 字节。
 */
export function encodeWave(samples) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeAscii = (at, value) => {
    for (let i = 0; i < value.length; i += 1) bytes[at + i] = value.charCodeAt(i);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

/** 把二进制录音编码为 Remote 用的 base64（不带 data URL 前缀）。 */
export function audioBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(text);
}

/** 浏览器是否具备录音能力。 */
export function canRecord(nav = globalThis.navigator) {
  return typeof MediaRecorder !== 'undefined' && nav?.mediaDevices?.getUserMedia !== undefined;
}

/**
 * 一次麦克风采集。
 *
 * 生命周期与语音插件保持一致：`start` 拿到轨道后开始录，`stop` 停止并
 * 重采样成 16 kHz 单声道，`dispose` 释放轨道与 AudioContext。任何路径
 * 都保证释放一次。
 */
export class Recording {
  constructor({ deviceId, onError } = {}) {
    this.deviceId = deviceId;
    this.onError = onError;
    this.chunks = [];
    this.stream = undefined;
    this.recorder = undefined;
    this.context = undefined;
    this.disposal = undefined;
    this.abort = new AbortController();
  }

  /** 开始采集；权限被拒或设备不可用时抛 RecordingError。 */
  async start() {
    try {
      const constraints = { audio: this.deviceId !== undefined ? { deviceId: { exact: this.deviceId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.abort.signal.aborted) {
        for (const track of stream.getTracks()) track.stop();
        throw new RecordingError('cancelled');
      }
      this.stream = stream;
      const recorder = new MediaRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) this.chunks.push(event.data);
      };
      recorder.onerror = () => {
        this.onError?.(new RecordingError('interrupted'));
      };
      recorder.start();
    } catch (error) {
      await this.dispose();
      if (error instanceof RecordingError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new RecordingError(/denied|not allowed/i.test(message) ? 'permission' : 'unavailable');
    }
  }

  /**
   * 结束采集并返回 WAV 字节。
   *
   * @param maxDurationSeconds 宿主声明的时长上限；超时部分直接截断。
   * @returns 完整的 WAV 字节。
   */
  async stop(maxDurationSeconds) {
    const recorder = this.recorder;
    if (recorder === undefined || recorder.state !== 'recording') {
      await this.dispose();
      throw new RecordingError('empty');
    }
    try {
      await new Promise((resolvePromise, reject) => {
        recorder.onstop = () => resolvePromise();
        recorder.onerror = () => reject(new RecordingError('empty'));
        recorder.stop();
      });
      for (const track of this.stream?.getTracks() ?? []) track.stop();
      const blob = new Blob(this.chunks, { type: recorder.mimeType });
      if (blob.size === 0) throw new RecordingError('empty');
      const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      const context = new AudioContextCtor();
      this.context = context;
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const seconds = Math.max(1, Math.floor(Math.min(decoded.duration, maxDurationSeconds) * 16000));
      const offline = new OfflineAudioContext(1, seconds, 16000);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const resampled = await offline.startRendering();
      return encodeWave(resampled.getChannelData(0));
    } finally {
      await this.dispose();
    }
  }

  /** 释放轨道、录制器与 AudioContext（幂等）。 */
  dispose() {
    if (this.disposal === undefined) {
      this.abort.abort();
      this.disposal = (async () => {
        try {
          if (this.recorder !== undefined && this.recorder.state !== 'inactive') {
            try {
              this.recorder.stop();
            } catch {
              // 已经停掉就无所谓。
            }
          }
          for (const track of this.stream?.getTracks() ?? []) {
            try {
              track.stop();
            } catch {
              // 轨道可能已被系统回收。
            }
          }
          if (this.context !== undefined) await this.context.close().catch(() => undefined);
        } finally {
          this.stream = undefined;
          this.recorder = undefined;
          this.context = undefined;
        }
      })();
    }
    return this.disposal;
  }
}
