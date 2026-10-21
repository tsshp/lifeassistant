const emptyData = () => ({
  version: 2,
  trips: [], items: [], purchases: [], receipts: [], stores: [],
  tags: [], priceSightings: [], purchaseTypes: [], drafts: [], recentFilters: [],
  preferences: { columns: 2, sort: "activity", sortDirection: "desc" }
});
function normalizeData(value) {
  const defaults = emptyData();
  const source = value && typeof value === "object" ? value : {};
  return { ...defaults, ...source, preferences: { ...defaults.preferences, ...(source.preferences ?? {}) } };
}
let folderHandle = null;
let data = emptyData();
let dataLoaded = false;
const photoUrlCache = new Map();
let pendingWrite = null;
let writeTimer = null;
let writeQueue = Promise.resolve();
let lastWriteError = null;
let errorHandler = () => {};

function clearPhotoUrlCache() {
  for (const url of photoUrlCache.values()) URL.revokeObjectURL(url);
  photoUrlCache.clear();
}

async function readData() {
  if (!folderHandle) return data;
  if (dataLoaded) return data;
  try {
    const fileHandle = await folderHandle.getFileHandle("riceball.json");
    data = normalizeData(JSON.parse(await (await fileHandle.getFile()).text()));
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
    data = emptyData();
    await writeData();
  }
  dataLoaded = true;
  return data;
}

async function writeData() {
  if (!folderHandle) throw new Error("Choose a Riceball folder before saving");
  return writeSerialized(JSON.stringify(data, null, 2));
}

async function writeSerialized(serialized) {
  if (!folderHandle) throw new Error("Choose a Riceball folder before saving");
  const fileHandle = await folderHandle.getFileHandle("riceball.json", { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(serialized);
  await writable.close();
}

function scheduleWrite() {
  pendingWrite = JSON.stringify(data, null, 2);
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const snapshot = pendingWrite;
    pendingWrite = null;
    writeQueue = writeQueue.then(() => writeSerialized(snapshot)).catch((error) => {
      lastWriteError = error;
      console.error("Riceball could not save data", error);
      errorHandler(error);
    });
  }, 150);
}

async function flushWrites() {
  if (pendingWrite !== null) {
    clearTimeout(writeTimer);
    const snapshot = pendingWrite;
    pendingWrite = null;
    writeQueue = writeQueue.then(() => writeSerialized(snapshot));
  }
  await writeQueue;
  if (lastWriteError) {
    const error = lastWriteError;
    lastWriteError = null;
    throw error;
  }
}

async function ensurePermission() {
  if (!folderHandle) return false;
  if ((await folderHandle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await folderHandle.requestPermission({ mode: "readwrite" })) === "granted";
}

export const fileStore = {
  supported: "showDirectoryPicker" in window,
  hasFolder: () => folderHandle !== null,
  chooseFolder: async () => {
    if (!("showDirectoryPicker" in window)) throw new Error("This browser does not support folder access. Use Chrome or Edge on Android/desktop.");
    folderHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!(await ensurePermission())) throw new Error("Read/write permission was not granted for the selected folder");
    clearPhotoUrlCache();
    dataLoaded = false;
    await readData();
    return data;
  },
  load: readData,
  save: async (nextData) => { data = nextData; dataLoaded = true; scheduleWrite(); return data; },
  export: () => JSON.stringify(data, null, 2),
  import: async (json) => { data = normalizeData(JSON.parse(json)); dataLoaded = true; scheduleWrite(); await flushWrites(); return data; },
  flush: flushWrites,
  setErrorHandler: (handler) => { errorHandler = typeof handler === "function" ? handler : () => {}; },
  backupToFolder: async () => {
    if (!folderHandle) throw new Error("Choose a Riceball folder before backing up");
    if (!("showDirectoryPicker" in window)) throw new Error("This browser does not support folder backups");
    const target = await window.showDirectoryPicker({ mode: "readwrite" });
    await flushWrites();
    const jsonHandle = await target.getFileHandle("riceball.json", { create: true });
    const jsonWriter = await jsonHandle.createWritable();
    await jsonWriter.write(JSON.stringify(data, null, 2));
    await jsonWriter.close();
    const sourcePhotos = await folderHandle.getDirectoryHandle("photos").catch(() => null);
    if (sourcePhotos) {
      const targetPhotos = await target.getDirectoryHandle("photos", { create: true });
      for await (const entry of sourcePhotos.values()) {
        if (entry.kind !== "file") continue;
        const sourceFile = await entry.getFile();
        const targetHandle = await targetPhotos.getFileHandle(entry.name, { create: true });
        const writer = await targetHandle.createWritable();
        await writer.write(await sourceFile.arrayBuffer());
        await writer.close();
      }
    }
  },
  savePhoto: async (file, photoId, rotation = 0) => {
    if (!file || !folderHandle) return null;
    const photos = await folderHandle.getDirectoryHandle("photos", { create: true });
    const bitmap = await createImageBitmap(file);
    const quarterTurn = Math.abs(rotation) % 180 === 90;
    const sourceWidth = quarterTurn ? bitmap.height : bitmap.width;
    const sourceHeight = quarterTurn ? bitmap.width : bitmap.height;
    const scale = Math.min(1, 2560 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(bitmap, -bitmap.width * scale / 2, -bitmap.height * scale / 2, bitmap.width * scale, bitmap.height * scale);
    bitmap.close();
    const normalized = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not normalize image")), "image/jpeg", 0.9));
    const relativePath = `photos/${photoId}.jpg`;
    const oldUrl = photoUrlCache.get(relativePath);
    if (oldUrl) { URL.revokeObjectURL(oldUrl); photoUrlCache.delete(relativePath); }
    const photoHandle = await photos.getFileHandle(`${photoId}.jpg`, { create: true });
    const writable = await photoHandle.createWritable();
    await writable.write(await normalized.arrayBuffer());
    await writable.close();
    return relativePath;
  },
  transformPhoto: async (relativePath, photoId, rotation) => {
    if (!folderHandle || !relativePath) return null;
    const [directoryName, fileName] = relativePath.split("/");
    const directory = await folderHandle.getDirectoryHandle(directoryName);
    const fileHandle = await directory.getFileHandle(fileName);
    return fileStore.savePhoto(await fileHandle.getFile(), photoId, rotation);
  },
  deletePhoto: async (relativePath) => {
    if (!folderHandle || !relativePath) return;
    const [directoryName, fileName] = relativePath.split("/");
    const directory = await folderHandle.getDirectoryHandle(directoryName);
    const oldUrl = photoUrlCache.get(relativePath);
    if (oldUrl) { URL.revokeObjectURL(oldUrl); photoUrlCache.delete(relativePath); }
    await directory.removeEntry(fileName);
  },
  photoUrl: async (relativePath) => {
    if (!folderHandle || !relativePath) return null;
    if (photoUrlCache.has(relativePath)) return photoUrlCache.get(relativePath);
    const [directoryName, fileName] = relativePath.split("/");
    const directory = await folderHandle.getDirectoryHandle(directoryName);
    const fileHandle = await directory.getFileHandle(fileName);
    const url = URL.createObjectURL(await fileHandle.getFile());
    photoUrlCache.set(relativePath, url);
    return url;
  }
};
