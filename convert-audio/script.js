const dropZone       = document.getElementById('drop-zone');
const fileInput      = document.getElementById('file-input');
const browseBtn      = document.getElementById('browse-btn');
const previewSection = document.getElementById('preview-section');
const audioPlayer    = document.getElementById('audio-player');
const fileInfo       = document.getElementById('file-info');
const statusMsg      = document.getElementById('status-msg');
const errorMsg       = document.getElementById('error-msg');
const resetBtn       = document.getElementById('reset-btn');

let currentFile   = null;
let audioBuffer   = null; // original
let workingBuffer = null; // with transforms applied

// ---- Load file ----

browseBtn.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('click', (e) => {
  if (e.target !== browseBtn) fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

function loadFile(file) {
  if (!file.type.startsWith('audio/')) {
    showError('unsupported file type');
    return;
  }

  currentFile = file;
  const url = URL.createObjectURL(file);
  audioPlayer.src = url;

  dropZone.classList.add('hidden');
  previewSection.classList.remove('hidden');
  audioPlayer.classList.add('hidden');
  showStatus('loading');

  const ctx = new AudioContext();
  file.arrayBuffer().then(buf => ctx.decodeAudioData(buf)).then(decoded => {
    audioBuffer = workingBuffer = decoded;
    updateFileInfo(decoded);
    appliedTransforms = [];
    syncApplyBtn();
    hideError();
    hideStatus();
    audioPlayer.classList.remove('hidden');
  }).catch(() => {
    hideStatus();
    showError('could not decode audio — try a different format');
  });
}

// ---- Convert ----

document.querySelectorAll('.convert-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!audioBuffer) return;
    const format = btn.dataset.format;
    const name = currentFile.name.replace(/\.[^.]+$/, '');

    setButtons(true);
    audioPlayer.classList.add('hidden');
    showStatus('loading');

    setTimeout(() => {
      try {
        const blob = format === 'mp3' ? encodeMP3(workingBuffer) : encodeWAV(workingBuffer);
        download(blob, `${name}.${format}`);
      } catch (e) {
        showError('encoding failed');
      }
      hideStatus();
      audioPlayer.classList.remove('hidden');
      setButtons(false);
    }, 500);
  });
});

// ---- Transforms ----

const resetTransformBtn  = document.getElementById('reset-transform-btn');
const applyTransformsBtn = document.getElementById('apply-transforms-btn');

// Non-speed toggles
let selectedTransforms = [];

// Speed button cycle state: 0=off, 1=first, 2=second
const speedCycles = {
  half:   { labels: ['½×', '¼×'], factors: [0.5, 0.25] },
  double: { labels: ['2×',  '4×'], factors: [2,   4]   },
};
const speedState = { half: 0, double: 0 };

// Last-applied snapshot for headphones comparison
let appliedSnapshot = '';

function effectiveTransforms() {
  const all = [...selectedTransforms];
  for (const [group, state] of Object.entries(speedState)) {
    if (state > 0) all.push(`${group}:${state}`);
  }
  return all.sort().join(',');
}

function syncApplyBtn() {
  applyTransformsBtn.classList.toggle('has-changes', effectiveTransforms() !== appliedSnapshot);
}

function resetSpeedBtn(group) {
  speedState[group] = 0;
  const btn = document.querySelector(`[data-speed-group="${group}"]`);
  btn.textContent = speedCycles[group].labels[0];
  btn.classList.remove('selected');
}

// Speed buttons — cycle through states
document.querySelectorAll('.transform-btn[data-speed-group]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!audioBuffer) return;
    const group = btn.dataset.speedGroup;
    const opposite = group === 'half' ? 'double' : 'half';

    // Deselect opposite
    if (speedState[opposite] > 0) resetSpeedBtn(opposite);

    // Advance cycle: 0→1→2→0
    speedState[group] = (speedState[group] + 1) % 3;
    if (speedState[group] === 0) {
      btn.textContent = speedCycles[group].labels[0];
      btn.classList.remove('selected');
    } else {
      btn.textContent = speedCycles[group].labels[speedState[group] - 1];
      btn.classList.add('selected');
    }
    syncApplyBtn();
  });
});

// Non-speed buttons — simple toggle
document.querySelectorAll('.transform-btn[data-action]:not([data-speed-group])').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!audioBuffer) return;
    const action = btn.dataset.action;
    const idx = selectedTransforms.indexOf(action);
    if (idx !== -1) {
      selectedTransforms.splice(idx, 1);
      btn.classList.remove('selected');
    } else {
      selectedTransforms.push(action);
      btn.classList.add('selected');
    }
    syncApplyBtn();
  });
});

applyTransformsBtn.addEventListener('click', () => {
  if (!audioBuffer) return;
  setButtons(true);
  audioPlayer.classList.add('hidden');
  showStatus('loading');

  setTimeout(() => {
    workingBuffer = audioBuffer;
    for (const action of selectedTransforms) {
      if      (action === 'reverse')   workingBuffer = transformReverse(workingBuffer);
      else if (action === 'mono')      workingBuffer = transformMono(workingBuffer);
      else if (action === 'normalize') workingBuffer = transformNormalize(workingBuffer);
    }
    for (const [group, state] of Object.entries(speedState)) {
      if (state > 0) workingBuffer = transformSpeed(workingBuffer, speedCycles[group].factors[state - 1]);
    }
    appliedSnapshot = effectiveTransforms();
    syncApplyBtn();
    updatePlayer(workingBuffer);
    updateFileInfo(workingBuffer);
    hideStatus();
    audioPlayer.classList.remove('hidden');
    setButtons(false);
    const anySelected = selectedTransforms.length > 0 || Object.values(speedState).some(s => s > 0);
    resetTransformBtn.classList.toggle('hidden', !anySelected);
  }, 300);
});

resetTransformBtn.addEventListener('click', () => {
  workingBuffer    = audioBuffer;
  selectedTransforms = [];
  appliedSnapshot    = '';
  resetSpeedBtn('half');
  resetSpeedBtn('double');
  document.querySelectorAll('.transform-btn:not([data-speed-group])').forEach(b => b.classList.remove('selected'));
  syncApplyBtn();
  updatePlayer(workingBuffer);
  updateFileInfo(workingBuffer);
  resetTransformBtn.classList.add('hidden');
});

function transformReverse(buf) {
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const input = buf.getChannelData(c);
    const output = out.getChannelData(c);
    for (let i = 0; i < buf.length; i++) output[i] = input[buf.length - 1 - i];
  }
  return out;
}

function transformSpeed(buf, factor) {
  const newLength = Math.round(buf.length / factor);
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: newLength, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const input = buf.getChannelData(c);
    const output = out.getChannelData(c);
    for (let i = 0; i < newLength; i++) {
      const pos = i * factor;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      output[i] = idx + 1 < input.length
        ? input[idx] * (1 - frac) + input[idx + 1] * frac
        : input[Math.min(idx, input.length - 1)];
    }
  }
  return out;
}

function transformMono(buf) {
  const out = new AudioBuffer({ numberOfChannels: 1, length: buf.length, sampleRate: buf.sampleRate });
  const output = out.getChannelData(0);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const input = buf.getChannelData(c);
    for (let i = 0; i < buf.length; i++) output[i] += input[i] / buf.numberOfChannels;
  }
  return out;
}

function transformNormalize(buf) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak === 0 || peak >= 1) return buf;
  const gain = 1 / peak;
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const input = buf.getChannelData(c);
    const output = out.getChannelData(c);
    for (let i = 0; i < buf.length; i++) output[i] = input[i] * gain;
  }
  return out;
}

function updatePlayer(buf) {
  const wav = encodeWAV(buf);
  audioPlayer.src = URL.createObjectURL(wav);
}

function updateFileInfo(buf) {
  const mins = Math.floor(buf.duration / 60);
  const secs = Math.floor(buf.duration % 60).toString().padStart(2, '0');
  fileInfo.textContent = `${currentFile.name}  ·  ${mins}:${secs}  ·  ${buf.numberOfChannels === 1 ? 'mono' : 'stereo'}  ·  ${Math.round(buf.sampleRate / 1000)}kHz`;
}

// ---- WAV encoder ----

function encodeWAV(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate  = buffer.sampleRate;
  const samples     = interleave(buffer);
  const dataLen     = samples.length * 2;
  const arrayBuf    = new ArrayBuffer(44 + dataLen);
  const view        = new DataView(arrayBuf);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataLen, true);

  const int16 = new Int16Array(arrayBuf, 44);
  for (let i = 0; i < samples.length; i++) {
    int16[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
  }

  return new Blob([arrayBuf], { type: 'audio/wav' });
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// ---- MP3 encoder (lamejs) ----

function encodeMP3(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate  = buffer.sampleRate;
  const bitrate     = 128;
  const encoder     = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate);
  const blockSize   = 1152;
  const mp3Data     = [];

  const left  = toInt16(buffer.getChannelData(0));
  const right  = numChannels > 1 ? toInt16(buffer.getChannelData(1)) : left;

  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = right.subarray(i, i + blockSize);
    const chunk = numChannels > 1
      ? encoder.encodeBuffer(l, r)
      : encoder.encodeBuffer(l);
    if (chunk.length) mp3Data.push(chunk);
  }

  const final = encoder.flush();
  if (final.length) mp3Data.push(final);

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

function toInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-1, Math.min(1, float32[i])) * 0x7fff;
  }
  return int16;
}

function interleave(buffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(l.length * 2);
  for (let i = 0; i < l.length; i++) {
    out[i * 2]     = l[i];
    out[i * 2 + 1] = r[i];
  }
  return out;
}

// ---- Download ----

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Reset ----

resetBtn.addEventListener('click', () => {
  currentFile = audioBuffer = workingBuffer = null;
  audioPlayer.src = '';
  fileInput.value = '';
  previewSection.classList.add('hidden');
  dropZone.classList.remove('hidden');
  selectedTransforms = [];
  selectedTransforms = [];
  appliedSnapshot    = '';
  resetSpeedBtn('half');
  resetSpeedBtn('double');
  document.querySelectorAll('.transform-btn:not([data-speed-group])').forEach(b => b.classList.remove('selected'));
  syncApplyBtn();
  resetTransformBtn.classList.add('hidden');
  hideError();
  hideStatus();
});

// ---- UI helpers ----

function setButtons(disabled) {
  document.querySelectorAll('.convert-btn, .transform-btn').forEach(b => b.disabled = disabled);
}

let statusInterval = null;
const statusDots = ['', ' .', ' . .', ' . . .'];

function showStatus(msg) {
  let step = 0;
  statusMsg.textContent = msg;
  statusMsg.classList.remove('hidden');
  statusInterval = setInterval(() => {
    step = (step + 1) % statusDots.length;
    statusMsg.textContent = msg + statusDots[step];
  }, 400);
}

function hideStatus() {
  clearInterval(statusInterval);
  statusInterval = null;
  statusMsg.classList.add('hidden');
}
function showError(msg)  { errorMsg.textContent = msg; errorMsg.classList.remove('hidden'); }
function hideError()     { errorMsg.classList.add('hidden'); }
