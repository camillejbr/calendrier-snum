// Polyfill for the `window.storage` API used by the original Claude
// artifact sandbox, backed by the browser's localStorage instead.
function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : { value: raw };
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

window.storage = {
  async get(key) {
    return read(key);
  },
  async set(key, value) {
    return write(key, value);
  },
};
